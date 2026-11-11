// Uninstall.exe: removes Meloir from this PC. Spotify itself is not touched.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using Microsoft.Win32;

[assembly: AssemblyTitle("Uninstall Meloir")]
[assembly: AssemblyProduct("Meloir")]
[assembly: AssemblyVersion("1.3.0.0")]

static class Program
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int MessageBox(IntPtr hwnd, string text, string title, uint type);

    static int Main(string[] args)
    {
        const uint YesNo = 4, Yes = 6;
        bool ask = Array.IndexOf(args, "--yes") < 0;
        if (Process.GetProcessesByName("Meloir").Length > 0)
        {
            if (ask) MessageBox(IntPtr.Zero, "Close Meloir, then try again.", "Meloir", 0);
            return 1;
        }
        if (ask && MessageBox(IntPtr.Zero, "Remove Meloir from this PC?", "Meloir", YesNo) != Yes) return 0;

        string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        string menu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
        foreach (string link in new[] { Path.Combine(desktop, "Meloir.lnk"), Path.Combine(menu, "Meloir.lnk") })
            if (File.Exists(link)) File.Delete(link);
        Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\Meloir", false);
        string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Meloir");
        string prefs = Path.Combine(data, "prefs.json"), updates = Path.Combine(data, "update");
        if (File.Exists(prefs)) File.Delete(prefs);
        if (Directory.Exists(updates)) Directory.Delete(updates, true);
        if (Directory.Exists(data) && Directory.GetFileSystemEntries(data).Length == 0) Directory.Delete(data);

        // A running exe cannot delete itself: a short-lived shell does it after this one exits. Only
        // Meloir's own files go, and rmdir leaves the folder alone if anything else is in it.
        string folder = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        string command = "/c ping -n 3 127.0.0.1 >nul & del /q \"" + Path.Combine(folder, "Meloir.exe") + "\" \"" + Path.Combine(folder, "Uninstall.exe") + "\" & rmdir \"" + folder + "\"";
        ProcessStartInfo cleanup = new ProcessStartInfo("cmd.exe", command);
        cleanup.WorkingDirectory = Path.GetTempPath();
        cleanup.CreateNoWindow = true;
        cleanup.UseShellExecute = false;
        Process.Start(cleanup);
        return 0;
    }
}
