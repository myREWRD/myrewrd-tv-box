param([Parameter(Mandatory=$true)][string]$ArchivePath,
      [Parameter(Mandatory=$true)][string]$Destination,
      [Parameter(Mandatory=$true)][string]$ExpectedHash,
      [Parameter(Mandatory=$true)][string]$ExpectedVersion)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = "$PSHOME\Modules"
if ($ExpectedHash -notmatch '^[a-f0-9]{64}$' -or $ExpectedVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid runtime metadata' }
if ((Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedHash) { throw 'Runtime checksum mismatch' }
$destinationFull = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $destinationFull) { throw 'Extraction destination must be new' }
$ancestor = [IO.Directory]::GetParent($destinationFull)
while ($ancestor) {
  if ($ancestor.Exists -and ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Reparse-point destination denied' }
  $ancestor = $ancestor.Parent
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
  $targets = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $total = 0L
  if ($archive.Entries.Count -gt 10000) { throw 'Too many archive entries' }
  foreach ($entry in $archive.Entries) {
    $name = $entry.FullName.Replace('/', '\')
    if ([IO.Path]::IsPathRooted($name) -or $name.Contains(':') -or $name -match '(^|\\)\.\.?($|\\)' -or $name -match '[ .](\\|$)') { throw 'Unsafe archive path' }
    if ((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'Archive symlink denied' }
    $target = [IO.Path]::GetFullPath([IO.Path]::Combine($destinationFull,$name))
    if (!$target.StartsWith($destinationFull+'\',[StringComparison]::OrdinalIgnoreCase) -or !$targets.Add($target.TrimEnd('\'))) { throw 'Duplicate or escaping archive path' }
    $total += $entry.Length
    if ($entry.Length -gt 1073741824 -or $total -gt 2147483648) { throw 'Archive exceeds size limit' }
  }
  [IO.Directory]::CreateDirectory($destinationFull) | Out-Null
  foreach ($entry in $archive.Entries) {
    $target = [IO.Path]::Combine($destinationFull,$entry.FullName.Replace('/', '\'))
    if ($entry.FullName.EndsWith('/')) { [IO.Directory]::CreateDirectory($target) | Out-Null; continue }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$false)
  }
  $release = Get-Content -LiteralPath (Join-Path $destinationFull 'runtime-release.json') -Raw | ConvertFrom-Json
  if ($release.version -ne $ExpectedVersion -or $release.layout -ne 'installed-ab-v1') { throw 'Runtime release mismatch' }
  $exe = Join-Path $destinationFull 'myREWRD TV Box.exe'
  $bytes = [IO.File]::ReadAllBytes($exe)
  if ($bytes.Length -lt 10485760 -or $bytes[0] -ne 77 -or $bytes[1] -ne 90 -or !(Test-Path -LiteralPath (Join-Path $destinationFull 'resources\app.asar'))) { throw 'Incomplete runtime' }
} finally { $archive.Dispose() }
