# Observe only configured executable paths. No injection, hooks or elevation.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$targets = @()
$seen = @{}
# Console.In.ReadLineAsync is synchronous, including with redirected stdin.
# A dedicated C# thread owns blocking reads; the PowerShell loop keeps polling.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.Threading;
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
'@
$inputReader = New-Object OpenludeInputReader
function Emit($value) { [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress -Depth 5)); [Console]::Out.Flush() }
function Get-Snapshot {
  $snapshot = @{}; $byName = @{}
  foreach ($target in $targets) {
    $snapshot[$target.id] = [Collections.Generic.List[int]]::new()
    if (-not $byName.ContainsKey($target.name)) { $byName[$target.name] = @() }
    $byName[$target.name] += $target
  }
  if ($targets.Count -eq 0) { return $snapshot }
  # Enumerate processes once per poll, even when many applications are bound.
  foreach ($item in [Diagnostics.Process]::GetProcesses()) {
    try {
      $entries = $byName[$item.ProcessName]
      if ($null -eq $entries) { continue }
      $executable = $item.MainModule.FileName
      foreach ($entry in $entries) {
        if ([string]::Equals($executable, $entry.path, [StringComparison]::OrdinalIgnoreCase)) {
          $snapshot[$entry.id].Add($item.Id)
        }
      }
    } catch { } finally { $item.Dispose() }
  }
  return $snapshot
}
while ($true) {
  [string]$line = $null
  while ($inputReader.TryRead([ref]$line)) {
    try {
      $message = $line | ConvertFrom-Json
      if ($message.type -eq 'configure') {
        $targets = @(); $seen = @{}; $snapshot = @()
        foreach ($target in $message.targets) {
          $executable = $target.path
          if ([IO.Path]::GetExtension($executable) -ieq '.lnk') {
            $shortcutShell = New-Object -ComObject WScript.Shell
            $shortcut = $shortcutShell.CreateShortcut($executable)
            try { $executable = $shortcut.TargetPath }
            finally {
              [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut)
              [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shortcutShell)
            }
          }
          if ([IO.Path]::GetExtension($executable) -ine '.exe') { continue }
          $entry = @{ id = $target.id; path = [IO.Path]::GetFullPath($executable); name = [IO.Path]::GetFileNameWithoutExtension($executable) }
          $targets += $entry
        }
        $initial = Get-Snapshot
        foreach ($entry in $targets) {
          $processIds = @($initial[$entry.id]); $seen[$entry.id] = $processIds
          foreach ($processId in $processIds) { $snapshot += @{ id = $entry.id; pid = $processId } }
        }
        Emit @{ type = 'ready'; running = $snapshot }
      }
    } catch { Emit @{ type = 'error' } }
  }
  if ($inputReader.Completed) { break }
  $latest = Get-Snapshot
  foreach ($target in $targets) {
    $current = @($latest[$target.id]); $previous = @($seen[$target.id])
    if ($current.Count -gt 0 -and $previous.Count -eq 0) { Emit @{ type = 'launch'; id = $target.id; pid = $current[0] } }
    if ($current.Count -eq 0 -and $previous.Count -gt 0) { Emit @{ type = 'terminated'; id = $target.id; pid = $previous[0] } }
    $seen[$target.id] = $current
  }
  Start-Sleep -Milliseconds 200
}
