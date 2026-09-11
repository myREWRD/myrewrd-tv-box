param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = "$PSHOME\Modules"
if (!(Test-Path -LiteralPath $Directory)) { exit 0 }
$prefix = [IO.Path]::GetFullPath($Directory).TrimEnd('\')+'\'
foreach ($process in Get-Process) {
  $processPath = $null
  try { $processPath = $process.Path } catch { continue }
  if ($processPath -and $processPath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Inactive runtime is still running; update deferred.' }
}
$handles = [Collections.Generic.List[IDisposable]]::new()
try {
  foreach ($file in Get-ChildItem -LiteralPath $Directory -File -Recurse) {
    $handles.Add([IO.File]::Open($file.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None))
  }
} finally { foreach ($handle in $handles) { $handle.Dispose() } }
