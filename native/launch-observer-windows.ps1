# Observe only configured executable paths. No injection, hooks or elevation.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$targets = @()
$seen = @{}
# Console.In.ReadLineAsync is synchronous, including with redirected stdin.
# A dedicated C# thread owns blocking reads; the PowerShell loop keeps polling.
. (Join-Path $PSScriptRoot "windows-runtime.ps1")
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
      $executable = [OpenludePath]::Canonical($item.MainModule.FileName)
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
          $executable = [OpenludePath]::Canonical($target.path)
          if ([IO.Path]::GetExtension($executable) -ieq '.lnk') {
            $executable = [OpenludePath]::ShortcutTarget($executable)
            if ($env:OPENLUDE_OBSERVER_DIAGNOSTICS -eq '1') { Emit @{ type = 'diagnostic'; shortcut = $target.path; resolved = $executable } }
          }
          if ([IO.Path]::GetExtension($executable) -ine '.exe') { continue }
          $executable = [OpenludePath]::Canonical($executable)
          $entry = @{ id = $target.id; path = $executable; name = [IO.Path]::GetFileNameWithoutExtension($executable) }
          $targets += $entry
        }
        $initial = Get-Snapshot
        foreach ($entry in $targets) {
          $processIds = @($initial[$entry.id]); $seen[$entry.id] = $processIds
          foreach ($processId in $processIds) { $snapshot += @{ id = $entry.id; pid = $processId } }
        }
        Emit @{ type = 'ready'; running = $snapshot }
        if ($env:OPENLUDE_OBSERVER_DIAGNOSTICS -eq '1') { Emit @{ type = 'diagnostic'; targets = $targets } }
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
