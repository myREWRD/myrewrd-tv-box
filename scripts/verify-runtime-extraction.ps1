$ErrorActionPreference='Stop'
$env:PSModulePath="$PSHOME\Modules"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$fixtureRoot=Join-Path $env:TEMP ('tv-zip-tests-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null
$expand=Join-Path $PSScriptRoot '..\src\expand-runtime.ps1'
function Fixture([string]$name,[string]$extra,[string]$version='2.0.1',[bool]$symlink=$false) {
  $file=Join-Path $fixtureRoot ($name+'.zip')
  $zip=[IO.Compression.ZipFile]::Open($file,[IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach($entryName in @('myREWRD TV Box.exe','resources/app.asar','runtime-release.json') + @($extra | Where-Object { $_ })) {
      $entry=$zip.CreateEntry($entryName)
      if($symlink -and $entryName -eq $extra) { $entry.ExternalAttributes=-1610612736 }
      $stream=$entry.Open()
      try {
        if($entryName -eq 'myREWRD TV Box.exe') { $bytes=[byte[]]::new(11000000);$bytes[0]=77;$bytes[1]=90 }
        elseif($entryName -eq 'runtime-release.json') { $bytes=[Text.Encoding]::UTF8.GetBytes('{"version":"'+$version+'","layout":"installed-ab-v1"}') }
        else { $bytes=[Text.Encoding]::UTF8.GetBytes('fixture') }
        $stream.Write($bytes,0,$bytes.Length)
      } finally { $stream.Dispose() }
    }
  } finally { $zip.Dispose() }
  return $file
}
foreach($case in @('valid','traversal','absolute','duplicate','symlink','version','hash','ads')) {
  $extra=switch($case) { 'traversal' {'../escape'} 'absolute' {'C:/escape'} 'duplicate' {'RUNTIME-RELEASE.JSON'} 'symlink' {'link'} 'ads' {'file:stream'} default {''} }
  $version=if($case -eq 'version'){'9.0.0'}else{'2.0.1'}
  $archive=Fixture $case $extra $version ($case -eq 'symlink')
  $hash=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if($case -eq 'hash'){$hash='0'*64}
  $failed=$false
  try { & $expand -ArchivePath $archive -Destination (Join-Path $fixtureRoot $case) -ExpectedHash $hash -ExpectedVersion '2.0.1' } catch {$failed=$true}
  if(($case -eq 'valid') -eq $failed){throw "Unexpected extraction result: $case"}
  Write-Host "PASS archive $case"
}
Write-Host "Read-only fixture evidence: $fixtureRoot"
