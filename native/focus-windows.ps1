param([Parameter(Mandatory=$true)][string]$TargetPath, [int]$ProcessId = 0)
$ErrorActionPreference = 'Stop'
if ([IO.Path]::GetExtension($TargetPath) -ieq '.lnk') {
  $ShortcutShell = New-Object -ComObject WScript.Shell
  $TargetPath = $ShortcutShell.CreateShortcut($TargetPath).TargetPath
}
if (-not $TargetPath) { Write-Output 'False'; exit 0 }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class OpenludeWindows {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr handle, int command);
}
'@
$Candidates = if ($ProcessId -gt 0) { Get-Process -Id $ProcessId -ErrorAction SilentlyContinue } else { Get-Process }
$Candidate = $Candidates | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Path -ieq $TargetPath } | Select-Object -First 1
if ($null -eq $Candidate) { Write-Output 'False'; exit 0 }
if ([OpenludeWindows]::IsIconic($Candidate.MainWindowHandle)) {
  [void][OpenludeWindows]::ShowWindowAsync($Candidate.MainWindowHandle, 9)
}
Write-Output ([OpenludeWindows]::SetForegroundWindow($Candidate.MainWindowHandle))
