# Shared Unicode paths, shortcuts, input reader and window APIs.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class OpenludePath {
  [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
  private class ShellLink { }
  [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size, IntPtr data, uint flags);
    void GetIDList(out IntPtr idList);
    void SetIDList(IntPtr idList);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int size);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string value);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int size);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string value);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int size);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string value);
    void GetHotkey(out short value);
    void SetHotkey(short value);
    void GetShowCmd(out int value);
    void SetShowCmd(int value);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int size, out int index);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string value, int index);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string value, uint reserved);
    void Resolve(IntPtr window, uint flags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string value);
  }
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern uint GetLongPathName(string path, StringBuilder buffer, uint size);
  public static string Canonical(string path) {
    var full = Path.GetFullPath(path);
    if (Environment.OSVersion.Platform != PlatformID.Win32NT) return full;
    var buffer = new StringBuilder(32768);
    var length = GetLongPathName(full, buffer, (uint)buffer.Capacity);
    return length > 0 && length < buffer.Capacity ? buffer.ToString() : full;
  }
  public static string ShortcutTarget(string path) {
    object link = new ShellLink();
    try {
      ((System.Runtime.InteropServices.ComTypes.IPersistFile)link).Load(Canonical(path), 0);
      var target = new StringBuilder(32768);
      ((IShellLinkW)link).GetPath(target, target.Capacity, IntPtr.Zero, 0);
      return Environment.ExpandEnvironmentVariables(target.ToString());
    } finally { Marshal.FinalReleaseComObject(link); }
  }
}
public sealed class OpenludeInputReader {
  private readonly ConcurrentQueue<string> lines = new ConcurrentQueue<string>();
  private volatile bool completed;
  public OpenludeInputReader() {
    var thread = new Thread(Read);
    thread.IsBackground = true;
    thread.Start();
  }
  private void Read() {
    try {
      string line;
      while ((line = Console.In.ReadLine()) != null) lines.Enqueue(line);
    } catch (System.IO.IOException) { }
    finally { completed = true; }
  }
  public bool TryRead(out string line) { return lines.TryDequeue(out line); }
  public bool Completed { get { return completed && lines.IsEmpty; } }
}
public class OpenludeWindows {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr handle, int command);
}
'@
