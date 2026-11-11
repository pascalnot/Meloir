// Meloir.exe: starts the official Spotify app with a local debug connection and draws Meloir's
// interface over it. Spotify's files are not changed. Exits when Spotify closes.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

[assembly: AssemblyTitle("Meloir")]
[assembly: AssemblyProduct("Meloir")]
[assembly: AssemblyVersion("1.3.0.0")]

// One DevTools connection to the page.
class Cdp
{
    readonly ClientWebSocket socket = new ClientWebSocket();
    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
    readonly Dictionary<int, TaskCompletionSource<string>> waiting = new Dictionary<int, TaskCompletionSource<string>>();
    readonly SemaphoreSlim sending = new SemaphoreSlim(1);
    int nextId;

    public Action<string> OnBinding;

    public void Connect(string url)
    {
        socket.ConnectAsync(new Uri(url), CancellationToken.None).Wait();
    }

    public Task<string> Send(string method, Dictionary<string, object> parameters = null)
    {
        int id = Interlocked.Increment(ref nextId);
        TaskCompletionSource<string> reply = new TaskCompletionSource<string>();
        lock (waiting) waiting[id] = reply;
        Dictionary<string, object> message = new Dictionary<string, object>();
        message["id"] = id;
        message["method"] = method;
        message["params"] = parameters ?? new Dictionary<string, object>();
        byte[] bytes = Encoding.UTF8.GetBytes(json.Serialize(message));
        sending.Wait();
        try { socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None).Wait(); }
        finally { sending.Release(); }
        return reply.Task;
    }

    public void Pump()
    {
        byte[] buffer = new byte[1 << 18];
        MemoryStream text = new MemoryStream();
        while (socket.State == WebSocketState.Open)
        {
            WebSocketReceiveResult result = socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None).Result;
            if (result.MessageType == WebSocketMessageType.Close) return;
            text.Write(buffer, 0, result.Count);
            if (!result.EndOfMessage) continue;
            string message = Encoding.UTF8.GetString(text.ToArray());
            text.SetLength(0);
            Handle(message);
        }
    }

    void Handle(string message)
    {
        if (!message.StartsWith("{\"id\":"))
        {
            if (OnBinding == null || !message.Contains("Runtime.bindingCalled")) return;
            Dictionary<string, object> parsed = json.Deserialize<Dictionary<string, object>>(message);
            OnBinding((string)((Dictionary<string, object>)parsed["params"])["payload"]);
            return;
        }
        int end = message.IndexOf(',');
        int id;
        if (end < 0 || !int.TryParse(message.Substring(6, end - 6), out id)) return;
        TaskCompletionSource<string> reply = null;
        lock (waiting) if (waiting.TryGetValue(id, out reply)) waiting.Remove(id);
        if (reply != null) reply.TrySetResult(message);
    }
}

// Windows groups taskbar buttons by app id. Spotify's window and Meloir's shortcuts are given the
// same one, so they share a single Meloir button. Only the running window is labelled, so Spotify
// opened by itself looks normal.
static class Taskbar
{
    const string AppId = "Meloir.Spotify";
    const ushort TextValue = 31;
    const uint IdKey = 5, RelaunchCommandKey = 2, RelaunchIconKey = 3, RelaunchNameKey = 4;
    const uint SetIcon = 0x80, SmallIcon = 0, BigIcon = 1;
    const int ReadWrite = 2, ItemUpdated = 0x2000, PathGiven = 5;
    const int WatchMs = 1000;

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore
    {
        void GetCount(out uint count);
        void GetAt(uint index, out PropertyKey key);
        void GetValue(ref PropertyKey key, out PropVariant value);
        void SetValue(ref PropertyKey key, ref PropVariant value);
        void Commit();
    }

    [StructLayout(LayoutKind.Sequential)]
    struct PropertyKey { public Guid Format; public uint Id; }

    [StructLayout(LayoutKind.Sequential)]
    struct PropVariant { public ushort Type, Reserved1, Reserved2, Reserved3; public IntPtr Value, Extra; }

    [DllImport("shell32.dll")]
    static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern void SHChangeNotify(int eventId, int flags, string item, IntPtr unused);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern uint ExtractIconEx(string file, int index, out IntPtr large, out IntPtr small, uint count);

    [DllImport("ole32.dll")]
    static extern int PropVariantClear(ref PropVariant value);

    [DllImport("user32.dll")]
    static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);

    static PropertyKey Key(uint id)
    {
        PropertyKey key = new PropertyKey();
        key.Format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
        key.Id = id;
        return key;
    }

    static void Write(IPropertyStore store, uint id, string text)
    {
        PropertyKey key = Key(id);
        PropVariant value = new PropVariant();
        value.Type = TextValue;
        value.Value = Marshal.StringToCoTaskMemUni(text);
        try { store.SetValue(ref key, ref value); }
        finally { Marshal.FreeCoTaskMem(value.Value); }
    }

    static string Read(IPropertyStore store, uint id)
    {
        PropertyKey key = Key(id);
        PropVariant value;
        store.GetValue(ref key, out value);
        string text = value.Type == TextValue ? Marshal.PtrToStringUni(value.Value) : null;
        PropVariantClear(ref value);
        return text;
    }

    static void TagShortcut(string path)
    {
        if (!File.Exists(path)) return;
        object link = Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-C000-000000000046")));
        try
        {
            System.Runtime.InteropServices.ComTypes.IPersistFile file = (System.Runtime.InteropServices.ComTypes.IPersistFile)link;
            file.Load(path, ReadWrite);
            IPropertyStore store = (IPropertyStore)link;
            if (Read(store, IdKey) == AppId) return;
            Write(store, IdKey, AppId);
            store.Commit();
            file.Save(path, true);
            SHChangeNotify(ItemUpdated, PathGiven, path, IntPtr.Zero);
        }
        finally { Marshal.FinalReleaseComObject(link); }
    }

    static void TagWindow(IntPtr window, string exe, IntPtr bigIcon, IntPtr smallIcon)
    {
        Guid iid = typeof(IPropertyStore).GUID;
        IPropertyStore store;
        if (SHGetPropertyStoreForWindow(window, ref iid, out store) != 0) return;
        try
        {
            Write(store, RelaunchCommandKey, "\"" + exe + "\"");
            Write(store, RelaunchNameKey, "Meloir");
            Write(store, RelaunchIconKey, exe + ",0");
            Write(store, IdKey, AppId);
        }
        finally { Marshal.FinalReleaseComObject(store); }
        SendMessage(window, SetIcon, (IntPtr)BigIcon, bigIcon);
        SendMessage(window, SetIcon, (IntPtr)SmallIcon, smallIcon);
    }

    static void Watch()
    {
        string exe = Assembly.GetExecutingAssembly().Location;
        string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string[] shortcuts =
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Meloir.lnk"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Meloir.lnk"),
            Path.Combine(appData, @"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Meloir.lnk"),
        };
        foreach (string shortcut in shortcuts)
            try { TagShortcut(shortcut); } catch (Exception) { }

        IntPtr bigIcon, smallIcon;
        ExtractIconEx(exe, 0, out bigIcon, out smallIcon, 1);
        HashSet<IntPtr> tagged = new HashSet<IntPtr>();
        while (true)
        {
            foreach (Process process in Process.GetProcessesByName("Spotify"))
                using (process)
                    try
                    {
                        IntPtr window = process.MainWindowHandle;
                        if (window != IntPtr.Zero && tagged.Add(window)) TagWindow(window, exe, bigIcon, smallIcon);
                    }
                    catch (Exception) { }
            Thread.Sleep(WatchMs);
        }
    }

    public static void Start()
    {
        Thread watcher = new Thread(Watch);
        watcher.IsBackground = true;
        watcher.SetApartmentState(ApartmentState.STA);
        watcher.Start();
    }
}

// The page draws the window buttons and sends them here, because only this side can reach the window.
static class WindowControls
{
    const uint SysCommand = 0x112, Minimize = 0xF020, Maximize = 0xF030, Restore = 0xF120, CloseWindow = 0xF060;

    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr window);
    [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, IntPtr extra);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);

    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct MonitorInfo { public int Size; public Rect Screen, Work; public int Flags; }

    const int ShowRestored = 9, ShowMaximized = 3;
    const uint Nearest = 2, KeepOrder = 0x14;

    static bool filling, wasMaximized;
    static Rect before;

    const byte AltKey = 0x12;
    const uint KeyUp = 2;

    public static Cdp Page;

    public static bool Handles(string message)
    {
        return message == "min" || message == "max" || message == "close" || message == "state" || message == "menu" || message.StartsWith("fullscreen:");
    }

    static IntPtr SpotifyWindow()
    {
        IntPtr window = IntPtr.Zero;
        foreach (Process process in Process.GetProcessesByName("Spotify"))
            using (process)
                if (process.MainWindowHandle != IntPtr.Zero) window = process.MainWindowHandle;
        return window;
    }

    static void FillScreen(IntPtr window, bool fill)
    {
        if (fill == filling) return;
        filling = fill;
        if (fill)
        {
            wasMaximized = IsZoomed(window);
            if (wasMaximized) ShowWindow(window, ShowRestored);
            GetWindowRect(window, out before);
            MonitorInfo info = new MonitorInfo { Size = Marshal.SizeOf(typeof(MonitorInfo)) };
            GetMonitorInfo(MonitorFromWindow(window, Nearest), ref info);
            SetWindowPos(window, IntPtr.Zero, info.Screen.Left, info.Screen.Top, info.Screen.Right - info.Screen.Left, info.Screen.Bottom - info.Screen.Top, KeepOrder);
            return;
        }
        SetWindowPos(window, IntPtr.Zero, before.Left, before.Top, before.Right - before.Left, before.Bottom - before.Top, KeepOrder);
        if (wasMaximized) ShowWindow(window, ShowMaximized);
    }

    public static void Handle(string message)
    {
        IntPtr window = SpotifyWindow();
        if (window == IntPtr.Zero) return;
        if (message.StartsWith("fullscreen:"))
        {
            FillScreen(window, message.EndsWith("1"));
            return;
        }
        // Spotify's menu has no command of its own: it opens on Alt.
        if (message == "menu")
        {
            keybd_event(AltKey, 0, 0, IntPtr.Zero);
            keybd_event(AltKey, 0, KeyUp, IntPtr.Zero);
            return;
        }
        if (message == "state")
        {
            Dictionary<string, object> call = new Dictionary<string, object>();
            call["expression"] = "window.__meloirFrame && window.__meloirFrame(" + (IsZoomed(window) ? "true" : "false") + ")";
            Page.Send("Runtime.evaluate", call);
            return;
        }
        uint command = message == "min" ? Minimize : message == "close" ? CloseWindow : IsZoomed(window) ? Restore : Maximize;
        PostMessage(window, SysCommand, (IntPtr)command, IntPtr.Zero);
    }
}

// Looks for a newer release on GitHub. Installing only happens when the page asks, after a click,
// and only if the download matches the checksum GitHub gives for it.
static class Updater
{
    public const string Release = "v1.3.0";
    const string Feed = "https://api.github.com/repos/pascalnot/Meloir/releases/latest";
    const string Downloads = "https://github.com/pascalnot/Meloir/releases/download/";
    const string AssetName = "MeloirSetup.exe", DigestPrefix = "sha256:";
    const int RestartPauseSeconds = 3;

    public static string TestFeed;
    public static Cdp Page;
    static string tag, url, digest;

    static void Tell(string state, string newTag)
    {
        Dictionary<string, object> info = new Dictionary<string, object>();
        info["state"] = state;
        if (newTag != null) info["tag"] = newTag;
        Dictionary<string, object> call = new Dictionary<string, object>();
        call["expression"] = "window.__meloirUpdate && window.__meloirUpdate(" + new JavaScriptSerializer().Serialize(info) + ")";
        Page.Send("Runtime.evaluate", call);
    }

    static WebClient Client()
    {
        ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
        WebClient web = new WebClient();
        web.Headers[HttpRequestHeader.UserAgent] = "Meloir";
        return web;
    }

    static bool IsNewer(string candidate, string current)
    {
        MatchCollection a = Regex.Matches(candidate, @"\d+"), b = Regex.Matches(current, @"\d+");
        for (int i = 0; i < Math.Min(a.Count, b.Count); i++)
        {
            int left = int.Parse(a[i].Value), right = int.Parse(b[i].Value);
            if (left != right) return left > right;
        }
        return a.Count > b.Count;
    }

    static void Check()
    {
        using (WebClient web = Client())
        {
            // GitHub's latest release leaves out pre-releases, such as the old 3.0.0 betas.
            Dictionary<string, object> latest = (Dictionary<string, object>)new JavaScriptSerializer().DeserializeObject(web.DownloadString(TestFeed ?? Feed));
            string found = (string)latest["tag_name"];
            if (!IsNewer(found, Release)) { Tell("none", null); return; }
            foreach (object item in (object[])latest["assets"])
            {
                Dictionary<string, object> asset = (Dictionary<string, object>)item;
                if ((string)asset["name"] != AssetName) continue;
                tag = found;
                url = (string)asset["browser_download_url"];
                digest = asset.ContainsKey("digest") ? asset["digest"] as string : null;
                Tell("available", tag);
                return;
            }
            Tell("none", null);
        }
    }

    static void Install()
    {
        if (url == null) return;
        Tell("installing", null);
        bool trusted = TestFeed != null || url.StartsWith(Downloads, StringComparison.Ordinal);
        if (!trusted || digest == null || !digest.StartsWith(DigestPrefix, StringComparison.Ordinal)) { Tell("refused", null); return; }
        string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Meloir\update");
        Directory.CreateDirectory(folder);
        string setup = Path.Combine(folder, AssetName);
        using (WebClient web = Client()) web.DownloadFile(url, setup);
        using (SHA256 sha = SHA256.Create())
        using (FileStream file = File.OpenRead(setup))
            if (BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant() != digest.Substring(DigestPrefix.Length).ToLowerInvariant())
            {
                file.Close();
                File.Delete(setup);
                Tell("refused", null);
                return;
            }

        // The installer can't replace a running Meloir, so it waits for this one to close.
        string script = Path.Combine(folder, "update.cmd");
        string exe = Assembly.GetExecutingAssembly().Location;
        File.WriteAllText(script, "@echo off\r\nping -n " + RestartPauseSeconds + " 127.0.0.1 >nul\r\n\"" + setup + "\" --silent\r\nstart \"\" \"" + exe + "\"\r\n");
        ProcessStartInfo start = new ProcessStartInfo("cmd.exe", "/c \"" + script + "\"");
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        Process.Start(start);
        Environment.Exit(0);
    }

    public static void Handle(string message)
    {
        Thread worker = new Thread(() =>
        {
            try
            {
                if (message == "update:check") Check();
                else Install();
            }
            catch (Exception)
            {
                Tell("failed", null);
            }
        });
        worker.IsBackground = true;
        worker.Start();
    }
}

// Shows the current song on the user's Discord profile, through the pipe the Discord app listens on.
// Nothing happens unless the setting is on, and closing Meloir clears the status.
static class DiscordStatus
{
    const string ClientId = "1568388184247762995";
    const int Pipes = 10, ConnectMs = 300, AnswerMs = 2000, RetryMs = 15000, Handshake = 0, Frame = 1, HeaderBytes = 8;

    public static string TestId;

    static readonly AutoResetEvent Wake = new AutoResetEvent(false);
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static readonly object Lock = new object();
    static string wanted, shown;
    static NamedPipeClientStream pipe;
    static Thread worker;

    public static void Handle(string activity)
    {
        lock (Lock)
        {
            wanted = activity == "off" ? null : activity;
            if (worker == null)
            {
                worker = new Thread(Run);
                worker.IsBackground = true;
                worker.Start();
            }
        }
        Wake.Set();
    }

    static void Run()
    {
        for (;;)
        {
            Wake.WaitOne(RetryMs);
            string activity;
            lock (Lock) activity = wanted;
            try
            {
                bool open = pipe != null && pipe.IsConnected;
                if (activity == shown && open) continue;
                if (activity == null && !open) { shown = null; continue; }
                if (!open && !Connect()) continue;
                Dictionary<string, object> args = new Dictionary<string, object>();
                args["pid"] = Process.GetCurrentProcess().Id;
                args["activity"] = activity == null ? null : Json.DeserializeObject(activity);
                Dictionary<string, object> command = new Dictionary<string, object>();
                command["cmd"] = "SET_ACTIVITY";
                command["args"] = args;
                command["nonce"] = Guid.NewGuid().ToString();
                Write(pipe, Frame, Json.Serialize(command));
                shown = activity;
            }
            catch (Exception) { Close(); }
        }
    }

    static bool Connect()
    {
        Close();
        string id = string.IsNullOrEmpty(TestId) ? ClientId : TestId;
        if (id.Length == 0) return false;
        Dictionary<string, object> hello = new Dictionary<string, object>();
        hello["v"] = 1;
        hello["client_id"] = id;
        for (int n = 0; n < Pipes; n++)
        {
            NamedPipeClientStream candidate = new NamedPipeClientStream(".", "discord-ipc-" + n, PipeDirection.InOut, PipeOptions.Asynchronous);
            try
            {
                candidate.Connect(ConnectMs);
                Write(candidate, Handshake, Json.Serialize(hello));
                byte[] header = new byte[HeaderBytes];
                Task<int> answer = candidate.ReadAsync(header, 0, HeaderBytes);
                if (answer.Wait(AnswerMs) && answer.Result == HeaderBytes && BitConverter.ToInt32(header, 0) == Frame)
                {
                    pipe = candidate;
                    Thread drain = new Thread(() => Drain(candidate));
                    drain.IsBackground = true;
                    drain.Start();
                    return true;
                }
            }
            catch (Exception) { }
            candidate.Dispose();
        }
        return false;
    }

    // Discord answers every message, and its answers have to be read for the pipe to keep moving.
    static void Drain(Stream stream)
    {
        byte[] buffer = new byte[4096];
        try { while (stream.Read(buffer, 0, buffer.Length) > 0) { } }
        catch (Exception) { }
    }

    static void Write(Stream stream, int op, string json)
    {
        byte[] body = Encoding.UTF8.GetBytes(json);
        byte[] frame = new byte[HeaderBytes + body.Length];
        BitConverter.GetBytes(op).CopyTo(frame, 0);
        BitConverter.GetBytes(body.Length).CopyTo(frame, 4);
        body.CopyTo(frame, HeaderBytes);
        stream.Write(frame, 0, frame.Length);
        stream.Flush();
    }

    static void Close()
    {
        if (pipe != null) pipe.Dispose();
        pipe = null;
        shown = null;
    }
}

static class Program
{
    static readonly string[] Scripts = { "bridge.js", "audio.js", "data.js", "ui.js" };

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int MessageBox(IntPtr hwnd, string text, string title, uint type);

    [DllImport("user32.dll")]
    static extern bool SetProcessDPIAware();

    static string Option(string[] args, string name)
    {
        int index = Array.IndexOf(args, name);
        return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
    }

    // Settings live in a file of their own. The page's storage reaches the disk late, and Spotify
    // is often force closed, which loses whatever was changed last.
    // The page can't always reach the clipboard inside Spotify, so Meloir.exe puts the text there.
    static void CopyText(string text)
    {
        Thread copier = new Thread(() =>
        {
            try { System.Windows.Forms.Clipboard.SetText(text); }
            catch (Exception e) { Log("Could not copy", e); }
        });
        copier.SetApartmentState(ApartmentState.STA);
        copier.Start();
    }

    static string PrefsPath()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Meloir\prefs.json");
    }

    // Each save goes to a new file that then takes the old one's place, and the previous version is
    // kept as a backup. A file that can't be read is set aside instead of being overwritten, so a
    // bad start never wipes history or stats.
    static bool prefsUnreadable;

    static string ReadPrefs(string path)
    {
        JavaScriptSerializer json = new JavaScriptSerializer();
        return json.Serialize(json.DeserializeObject(File.ReadAllText(path)));
    }

    static string LoadPrefs()
    {
        string path = PrefsPath();
        if (!File.Exists(path) && !File.Exists(path + ".bak")) return "null";
        try { return ReadPrefs(path); }
        catch (Exception e) { Log("Could not read " + path, e); }
        try { return ReadPrefs(path + ".bak"); }
        catch (Exception e) { Log("Could not read the backup either", e); }
        prefsUnreadable = File.Exists(path);
        return "null";
    }

    static void SavePrefs(string prefs)
    {
        string path = PrefsPath();
        try
        {
            new JavaScriptSerializer().DeserializeObject(prefs);
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            if (prefsUnreadable)
            {
                File.Move(path, path + ".unreadable-" + DateTime.Now.ToString("yyyyMMdd-HHmmss"));
                prefsUnreadable = false;
            }
            string fresh = path + ".tmp";
            File.WriteAllText(fresh, prefs);
            if (File.Exists(path)) File.Replace(fresh, path, path + ".bak");
            else File.Move(fresh, path);
        }
        catch (Exception e)
        {
            Log("Could not save " + path, e);
        }
    }

    // A short record of what went wrong, next to the settings.
    static void Log(string what, Exception e)
    {
        try
        {
            string log = Path.Combine(Path.GetDirectoryName(PrefsPath()), "errors.log");
            if (File.Exists(log) && new FileInfo(log).Length > MaxLogBytes) File.Delete(log);
            File.AppendAllText(log, DateTime.Now.ToString("s") + " " + what + ": " + e.GetType().Name + ": " + e.Message + Environment.NewLine);
        }
        catch (Exception) { }
    }

    const int MaxLogBytes = 100000;

    static string Source()
    {
        StringBuilder source = new StringBuilder("window.meloirNative = true;\nwindow.meloirVersion = '" + Updater.Release + "';\nwindow.meloirSavedPrefs = " + LoadPrefs() + ";\n");
        Assembly assembly = Assembly.GetExecutingAssembly();
        using (StreamReader reader = new StreamReader(assembly.GetManifestResourceStream("CHANGELOG.md"), Encoding.UTF8))
            source.Append("window.meloirChangelog = ").Append(new JavaScriptSerializer().Serialize(reader.ReadToEnd())).Append(";\n");
        foreach (string name in Scripts)
            using (StreamReader reader = new StreamReader(assembly.GetManifestResourceStream(name), Encoding.UTF8))
                source.Append(reader.ReadToEnd()).Append('\n');
        return source.ToString();
    }

    // The debug connection only opens at startup, so a running Spotify has to restart.
    static void CloseSpotify()
    {
        Process[] running = Process.GetProcessesByName("Spotify");
        if (running.Length == 0) return;
        foreach (Process process in running)
            if (process.MainWindowHandle != IntPtr.Zero) process.CloseMainWindow();
        for (int i = 0; i < 15 && Process.GetProcessesByName("Spotify").Length > 0; i++) Thread.Sleep(200);
        foreach (Process process in Process.GetProcessesByName("Spotify"))
            try { process.Kill(); } catch (InvalidOperationException) { } catch (System.ComponentModel.Win32Exception) { }
        for (int i = 0; i < 25 && Process.GetProcessesByName("Spotify").Length > 0; i++) Thread.Sleep(200);
    }

    static int FreePort()
    {
        TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    static string FindPage(int port)
    {
        JavaScriptSerializer json = new JavaScriptSerializer();
        for (int i = 0; i < 300; i++)
        {
            Thread.Sleep(200);
            try
            {
                using (WebClient web = new WebClient())
                    foreach (Dictionary<string, object> target in json.Deserialize<List<Dictionary<string, object>>>(web.DownloadString("http://127.0.0.1:" + port + "/json/list")))
                        if ((string)target["type"] == "page") return (string)target["webSocketDebuggerUrl"];
            }
            catch (WebException) { }
        }
        return null;
    }

    static int Main(string[] args)
    {
        SetProcessDPIAware();
        bool created;
        using (Mutex single = new Mutex(true, "Local\\MeloirApp", out created))
        {
            if (!created) return 0;
            return Run(args);
        }
    }

    static int Run(string[] args)
    {
        string spotify = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Spotify\Spotify.exe");
        if (!File.Exists(spotify))
        {
            MessageBox(IntPtr.Zero, "Meloir needs the Spotify desktop app from spotify.com, which was not found on this PC.", "Meloir", 0);
            return 1;
        }

        CloseSpotify();
        string fixedPort = Option(args, "--port");
        int port = fixedPort != null ? int.Parse(fixedPort) : FreePort();
        ProcessStartInfo start = new ProcessStartInfo(spotify, "--remote-debugging-port=" + port);
        start.UseShellExecute = false;
        Process.Start(start);
        Taskbar.Start();

        string page = FindPage(port);
        if (page == null)
        {
            MessageBox(IntPtr.Zero, "Meloir could not connect to Spotify.", "Meloir", 0);
            return 1;
        }

        Cdp cdp = new Cdp();
        cdp.OnBinding = message =>
        {
            if (message.StartsWith("prefs:")) SavePrefs(message.Substring(6));
            else if (message.StartsWith("update:")) Updater.Handle(message);
            else if (message.StartsWith("discord:")) DiscordStatus.Handle(message.Substring(8));
            else if (WindowControls.Handles(message)) WindowControls.Handle(message);
            else if (message.StartsWith("copy:")) CopyText(message.Substring(5));
        };
        Updater.Page = cdp;
        WindowControls.Page = cdp;
        Updater.TestFeed = Option(args, "--update-feed");
        DiscordStatus.TestId = Option(args, "--discord-id");
        cdp.Connect(page);
        Thread pump = new Thread(() => { try { cdp.Pump(); } catch (AggregateException) { } });
        pump.IsBackground = true;
        pump.Start();

        Dictionary<string, object> enabled = new Dictionary<string, object>();
        enabled["enabled"] = true;
        Dictionary<string, object> script = new Dictionary<string, object>();
        script["source"] = Source();
        Dictionary<string, object> binding = new Dictionary<string, object>();
        binding["name"] = "meloirHost";
        cdp.Send("Page.enable");
        cdp.Send("Runtime.enable");
        cdp.Send("Runtime.addBinding", binding);
        cdp.Send("Page.setBypassCSP", enabled);
        cdp.Send("Page.addScriptToEvaluateOnNewDocument", script);
        cdp.Send("Page.reload");

        string probe = Option(args, "--probe");
        if (probe != null)
        {
            Probe(cdp, probe, Option(args, "--probe-out"));
            return 0;
        }

        pump.Join();
        return 0;
    }

    // For tests: evaluates a script after load and writes the result. Spotify stays open.
    static void Probe(Cdp cdp, string probe, string output)
    {
        Thread.Sleep(12000);
        Dictionary<string, object> call = new Dictionary<string, object>();
        call["expression"] = File.ReadAllText(probe);
        call["awaitPromise"] = true;
        call["returnByValue"] = true;
        File.WriteAllText(output, cdp.Send("Runtime.evaluate", call).Result);
    }
}
