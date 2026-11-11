// MeloirSetup.exe: Meloir's own installer. Installs for the current user, so it needs no admin rights.
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Meloir Setup")]
[assembly: AssemblyProduct("Meloir")]
[assembly: AssemblyVersion("1.3.0.0")]

static class Installer
{
    public const string Version = "1.3.0";
    const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Meloir";

    static readonly string[] AppFiles = { "Meloir.exe", "Uninstall.exe" };

    // Where an earlier install went, so an update lands in the same place.
    static readonly string Previous = PreviousFolder();

    public static string Folder = Previous
        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Meloir");
    public static string Exe { get { return Path.Combine(Folder, "Meloir.exe"); } }
    public static string Uninstaller { get { return Path.Combine(Previous ?? Folder, "Uninstall.exe"); } }
    public static bool CanUninstall { get { return Previous != null && File.Exists(Uninstaller); } }

    static string PreviousFolder()
    {
        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(UninstallKey))
            return key == null ? null : key.GetValue("InstallLocation") as string;
    }

    // Meloir always gets a folder of its own, so a choice like Documents is never used directly.
    public static void Choose(string folder)
    {
        bool named = string.Equals(Path.GetFileName(folder.TrimEnd('\\')), "Meloir", StringComparison.OrdinalIgnoreCase);
        Folder = named ? folder : Path.Combine(folder, "Meloir");
    }

    // An install in a new place takes the old copy away: only Meloir's files, and the folder if empty.
    static void RemovePrevious()
    {
        if (Previous == null || string.Equals(Path.GetFullPath(Previous).TrimEnd('\\'), Path.GetFullPath(Folder).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) return;
        foreach (string file in AppFiles)
        {
            string path = Path.Combine(Previous, file);
            if (File.Exists(path)) File.Delete(path);
        }
        if (Directory.Exists(Previous) && Directory.GetFileSystemEntries(Previous).Length == 0) Directory.Delete(Previous);
    }

    public static bool HasSpotify()
    {
        return File.Exists(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Spotify\Spotify.exe"));
    }

    public static bool MeloirIsRunning()
    {
        return Process.GetProcessesByName("Meloir").Length > 0;
    }

    // Only Meloir's own files are written: anything else in the folder is left alone.
    public static void CopyApp(Action<double> progress)
    {
        Directory.CreateDirectory(Folder);
        using (Stream source = Assembly.GetExecutingAssembly().GetManifestResourceStream("meloir.zip"))
        using (ZipArchive archive = new ZipArchive(source, ZipArchiveMode.Read))
        {
            int done = 0;
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                string target = Path.Combine(Folder, entry.FullName);
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                if (entry.Name.Length > 0) entry.ExtractToFile(target, true);
                progress(++done / (double)archive.Entries.Count);
            }
        }
        RemovePrevious();
    }

    static void Shortcut(string path)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(shellType);
        object link = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
        Type linkType = link.GetType();
        linkType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { Exe });
        linkType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link, new object[] { Folder });
        linkType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, link, new object[] { Exe + ",0" });
        linkType.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { "Meloir" });
        linkType.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
        Marshal.FinalReleaseComObject(link);
        Marshal.FinalReleaseComObject(shell);
    }

    public static void CreateShortcuts(bool desktop)
    {
        Shortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Meloir.lnk"));
        if (desktop) Shortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Meloir.lnk"));
    }

    public static void Register()
    {
        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey))
        {
            key.SetValue("DisplayName", "Meloir");
            key.SetValue("DisplayVersion", Version);
            key.SetValue("DisplayIcon", Exe);
            key.SetValue("Publisher", "Meloir");
            key.SetValue("InstallLocation", Folder);
            key.SetValue("UninstallString", "\"" + Path.Combine(Folder, "Uninstall.exe") + "\"");
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }
    }
}

class SetupForm : Form
{
    enum Step { Welcome, Installing, Done, Failed, Confirm, Removed }

    readonly System.Windows.Forms.Timer clock = new System.Windows.Forms.Timer();
    readonly Stopwatch time = Stopwatch.StartNew();
    readonly float s;
    Step step = Step.Welcome;
    bool desktop = true, hoverAction, hoverClose, hoverToggle, hoverChange, hoverLink;
    double progress, shownProgress, stepStarted;
    string status = "", failure = "", failureTitle = "Meloir was not installed";
    Point dragFrom;

    public SetupForm()
    {
        using (Graphics g = CreateGraphics()) s = g.DpiX / 96f;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(P(520), P(420));
        BackColor = Color.Black;
        DoubleBuffered = true;
        Text = "Meloir Setup";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        Opacity = 0;
        clock.Interval = 16;
        clock.Tick += (a, b) => Tick();
        clock.Start();
        if (!Installer.HasSpotify()) Fail("Meloir needs the Spotify desktop app. Install it from spotify.com, then run this again.");
    }

    int P(float v) { return (int)Math.Round(v * s); }

    Rectangle ActionRect { get { return new Rectangle(P(170), P(342), P(180), P(44)); } }
    Rectangle CloseRect { get { return new Rectangle(ClientSize.Width - P(46), 0, P(46), P(38)); } }
    Rectangle ToggleRect { get { return new Rectangle(P(170), P(296), P(180), P(28)); } }
    Rectangle PathRect { get { return new Rectangle(P(70), P(254), P(310), P(28)); } }
    Rectangle ChangeRect { get { return new Rectangle(P(388), P(254), P(62), P(28)); } }
    Rectangle LinkRect { get { return new Rectangle(P(210), P(390), P(100), P(22)); } }
    bool ShowsLink { get { return step == Step.Confirm || (step == Step.Welcome && Installer.CanUninstall); } }

    void ChooseFolder()
    {
        using (FolderBrowserDialog dialog = new FolderBrowserDialog())
        {
            dialog.Description = "Choose where to install Meloir. It gets a Meloir folder of its own there.";
            dialog.SelectedPath = Path.GetDirectoryName(Installer.Folder.TrimEnd('\\'));
            if (dialog.ShowDialog(this) == DialogResult.OK) Installer.Choose(dialog.SelectedPath);
        }
    }

    void Fail(string message) { failure = message; Go(Step.Failed); }
    void Go(Step next) { step = next; stepStarted = time.Elapsed.TotalSeconds; }

    void Tick()
    {
        if (Opacity < 1) Opacity = Math.Min(1, Opacity + 0.06);
        shownProgress += (progress - shownProgress) * 0.09;
        if (step == Step.Installing && progress >= 1 && shownProgress > 0.995) Go(Step.Done);
        Invalidate();
    }

    void Install()
    {
        if (Installer.MeloirIsRunning()) { Fail("Close Meloir, then run this again."); return; }
        Go(Step.Installing);
        bool wantDesktop = desktop;
        Thread worker = new Thread(() =>
        {
            try
            {
                Report(0.02, "Copying Meloir");
                Installer.CopyApp(done => Report(0.02 + done * 0.88, "Copying Meloir"));
                Report(0.93, "Creating shortcuts");
                Installer.CreateShortcuts(wantDesktop);
                Report(0.97, "Registering the app");
                Installer.Register();
                Thread.Sleep(250);
                Report(1, "Finishing");
            }
            catch (UnauthorizedAccessException)
            {
                BeginInvoke((Action)(() => Fail("Windows won't let Meloir use that folder. Run this again and choose another one.")));
            }
            catch (Exception e)
            {
                BeginInvoke((Action)(() => Fail(e.Message)));
            }
        });
        worker.IsBackground = true;
        worker.Start();
    }

    // The uninstaller does the work, so this and Add or remove programs always do the same thing.
    void Remove()
    {
        if (Installer.MeloirIsRunning()) { Refuse("Close Meloir, then run this again."); return; }
        using (Process uninstall = Process.Start(Installer.Uninstaller, "--yes"))
        {
            uninstall.WaitForExit();
            if (uninstall.ExitCode == 0) Go(Step.Removed);
            else Refuse("Windows would not let Meloir remove itself. Try again in a moment.");
        }
    }

    void Refuse(string message)
    {
        failureTitle = "Meloir was not removed";
        Fail(message);
    }

    void Report(double value, string text)
    {
        BeginInvoke((Action)(() => { progress = value; status = text; }));
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left) dragFrom = e.Location;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        hoverAction = ActionRect.Contains(e.Location) && step != Step.Installing;
        hoverClose = CloseRect.Contains(e.Location);
        hoverToggle = ToggleRect.Contains(e.Location) && step == Step.Welcome;
        hoverChange = ChangeRect.Contains(e.Location) && step == Step.Welcome;
        hoverLink = LinkRect.Contains(e.Location) && ShowsLink;
        Cursor = hoverAction || hoverClose || hoverToggle || hoverChange || hoverLink ? Cursors.Hand : Cursors.Default;
        if (e.Button == MouseButtons.Left && !hoverAction && !hoverClose && !hoverChange && !hoverLink)
            Location = new Point(Location.X + e.X - dragFrom.X, Location.Y + e.Y - dragFrom.Y);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        if (CloseRect.Contains(e.Location)) { if (step != Step.Installing) Close(); return; }
        if (hoverToggle) { desktop = !desktop; return; }
        if (hoverChange) { ChooseFolder(); return; }
        if (hoverLink) { Go(step == Step.Welcome ? Step.Confirm : Step.Welcome); return; }
        if (!ActionRect.Contains(e.Location)) return;
        if (step == Step.Welcome) Install();
        else if (step == Step.Confirm) Remove();
        else if (step == Step.Failed || step == Step.Removed) Close();
        else if (step == Step.Done) { Process.Start(Installer.Exe); Close(); }
    }

    void Centered(Graphics g, string text, Font font, Color color, float y)
    {
        using (SolidBrush brush = new SolidBrush(color))
        using (StringFormat format = new StringFormat { Alignment = StringAlignment.Center })
            g.DrawString(text, font, brush, new RectangleF(P(24), y, ClientSize.Width - P(48), P(60)), format);
    }

    void Pill(Graphics g, Rectangle r, string text, bool hover)
    {
        int d = r.Height;
        using (GraphicsPath path = new GraphicsPath())
        using (SolidBrush fill = new SolidBrush(hover ? Color.FromArgb(214, 214, 214) : Color.White))
        using (SolidBrush ink = new SolidBrush(Color.Black))
        using (Font font = new Font("Segoe UI Semibold", 11f))
        using (StringFormat format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
        {
            path.AddArc(r.X, r.Y, d, d, 90, 180);
            path.AddArc(r.Right - d, r.Y, d, d, 270, 180);
            path.CloseFigure();
            g.FillPath(fill, path);
            g.DrawString(text, font, ink, r, format);
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        double now = time.Elapsed.TotalSeconds;
        double since = now - stepStarted;

        using (Pen edge = new Pen(Color.FromArgb(38, 38, 38)))
            g.DrawRectangle(edge, 0, 0, ClientSize.Width - 1, ClientSize.Height - 1);

        // The disc breathes while idle and settles as the install runs.
        float breathe = step == Step.Installing ? 0 : (float)(Math.Sin(now * 1.6) * 2.5);
        float size = P(92) + breathe * s;
        float cx = ClientSize.Width / 2f, cy = P(104);
        MeloirLogo.Draw(g, new RectangleF(cx - size / 2, cy - size / 2, size, size), Color.White, Color.Black);

        if (step == Step.Installing)
        {
            float ring = P(124);
            using (Pen track = new Pen(Color.FromArgb(38, 38, 38), P(2)))
            using (Pen arc = new Pen(Color.White, P(2)))
            {
                arc.StartCap = arc.EndCap = LineCap.Round;
                g.DrawEllipse(track, cx - ring / 2, cy - ring / 2, ring, ring);
                g.DrawArc(arc, cx - ring / 2, cy - ring / 2, ring, ring, -90, (float)(Math.Max(0.01, shownProgress) * 360));
            }
        }

        using (Font title = new Font("Segoe UI Semibold", 20f))
        using (Font body = new Font("Segoe UI", 10.5f))
        {
            Color mute = Color.FromArgb(140, 140, 140);
            float y = P(176);
            if (step == Step.Welcome)
            {
                Centered(g, "Meloir", title, Color.White, y);
                Centered(g, "A black desktop client for Spotify", body, mute, y + P(40));
                DrawLocation(g);
                DrawToggle(g, body);
                Pill(g, ActionRect, "Install", hoverAction);
                if (ShowsLink) DrawLink(g, "Uninstall");
            }
            else if (step == Step.Confirm)
            {
                Centered(g, "Remove Meloir?", title, Color.White, y);
                Centered(g, "Your Meloir settings, history and stats go with it. Spotify stays as it is.", body, mute, y + P(40));
                Pill(g, ActionRect, "Remove", hoverAction);
                DrawLink(g, "Cancel");
            }
            else if (step == Step.Removed)
            {
                Centered(g, "Meloir is removed", title, Color.White, y);
                Centered(g, "Spotify is back to normal", body, mute, y + P(40));
                Pill(g, ActionRect, "Close", hoverAction);
            }
            else if (step == Step.Installing)
            {
                Centered(g, "Installing", title, Color.White, y);
                Centered(g, status, body, mute, y + P(40));
            }
            else if (step == Step.Done)
            {
                Centered(g, "Meloir is ready", title, Color.White, y);
                Centered(g, "Sign in with Spotify the first time you open it", body, mute, y + P(40));
                Pill(g, ActionRect, "Open Meloir", hoverAction);
            }
            else
            {
                Centered(g, failureTitle, title, Color.White, y);
                Centered(g, failure, body, mute, y + P(40));
                Pill(g, ActionRect, "Close", hoverAction);
            }
        }

        if (step != Step.Installing)
        {
            Rectangle c = CloseRect;
            using (Pen x = new Pen(hoverClose ? Color.White : Color.FromArgb(140, 140, 140), s))
            {
                float m = P(5), px = c.X + c.Width / 2f, py = c.Y + c.Height / 2f;
                g.DrawLine(x, px - m, py - m, px + m, py + m);
                g.DrawLine(x, px - m, py + m, px + m, py - m);
            }
        }
    }

    void DrawLink(Graphics g, string text)
    {
        using (Font small = new Font("Segoe UI", 9f))
        using (SolidBrush ink = new SolidBrush(hoverLink ? Color.White : Color.FromArgb(140, 140, 140)))
        using (StringFormat format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
            g.DrawString(text, small, ink, LinkRect, format);
    }

    void DrawLocation(Graphics g)
    {
        using (Font small = new Font("Segoe UI", 9f))
        using (SolidBrush path = new SolidBrush(Color.FromArgb(140, 140, 140)))
        using (SolidBrush change = new SolidBrush(hoverChange ? Color.White : Color.FromArgb(200, 200, 200)))
        using (StringFormat left = new StringFormat { LineAlignment = StringAlignment.Center, Alignment = StringAlignment.Far, Trimming = StringTrimming.EllipsisPath, FormatFlags = StringFormatFlags.NoWrap })
        using (StringFormat right = new StringFormat { LineAlignment = StringAlignment.Center })
        {
            g.DrawString(Installer.Folder, small, path, PathRect, left);
            g.DrawString("Change", small, change, ChangeRect, right);
        }
    }

    void DrawToggle(Graphics g, Font font)
    {
        Rectangle r = ToggleRect;
        float w = P(32), h = P(18), x = r.X, y = r.Y + (r.Height - h) / 2;
        using (GraphicsPath path = new GraphicsPath())
        using (SolidBrush track = new SolidBrush(desktop ? Color.White : Color.FromArgb(50, 50, 50)))
        using (SolidBrush knob = new SolidBrush(desktop ? Color.Black : Color.FromArgb(170, 170, 170)))
        using (SolidBrush ink = new SolidBrush(hoverToggle ? Color.White : Color.FromArgb(170, 170, 170)))
        using (StringFormat format = new StringFormat { LineAlignment = StringAlignment.Center })
        {
            path.AddArc(x, y, h, h, 90, 180);
            path.AddArc(x + w - h, y, h, h, 270, 180);
            path.CloseFigure();
            g.FillPath(track, path);
            float pad = P(3), d = h - pad * 2;
            g.FillEllipse(knob, desktop ? x + w - d - pad : x + pad, y + pad, d, d);
            g.DrawString("Desktop shortcut", font, ink, new RectangleF(x + w + P(10), r.Y, r.Width, r.Height), format);
        }
    }
}

static class Program
{
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    [STAThread]
    static int Main(string[] args)
    {
        if (Array.IndexOf(args, "--silent") >= 0)
        {
            if (!Installer.HasSpotify() || Installer.MeloirIsRunning()) return 1;
            int dir = Array.IndexOf(args, "--dir");
            if (dir >= 0 && dir + 1 < args.Length) Installer.Choose(args[dir + 1]);
            Installer.CopyApp(done => { });
            Installer.CreateShortcuts(false);
            Installer.Register();
            return 0;
        }
        SetProcessDPIAware();
        Application.EnableVisualStyles();
        Application.Run(new SetupForm());
        return 0;
    }
}
