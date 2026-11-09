param([Parameter(Mandatory=$true)][string]$TargetPath, [int]$ProcessId = 0)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot "windows-runtime.ps1")
$TargetPath = [OpenludePath]::Canonical($TargetPath)
if ([IO.Path]::GetExtension($TargetPath) -ieq '.lnk') {
  $TargetPath = [OpenludePath]::ShortcutTarget($TargetPath)
}
if ($TargetPath) { $TargetPath = [OpenludePath]::Canonical($TargetPath) }
if (-not $TargetPath) { Write-Output 'False'; exit 0 }

$Candidates = if ($ProcessId -gt 0) { Get-Process -Id $ProcessId -ErrorAction SilentlyContinue } else { Get-Process }
$Candidate = $Candidates | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Path -and [OpenludePath]::Canonical($_.Path) -ieq $TargetPath } | Select-Object -First 1
if ($null -eq $Candidate) { Write-Output 'False'; exit 0 }
if ([OpenludeWindows]::IsIconic($Candidate.MainWindowHandle)) {
  [void][OpenludeWindows]::ShowWindowAsync($Candidate.MainWindowHandle, 9)
}
Write-Output ([OpenludeWindows]::SetForegroundWindow($Candidate.MainWindowHandle))
