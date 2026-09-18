# Attended bridge for the pre-original-fs updater. Uses the signed candidate's
# existing A/B supervisor; never edits a running ASAR or provider profile.
param([string]$ArchivePath)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = "$PSHOME\Modules"
$root = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE 'myREWRD-TV-Box'))
$ancestor = [IO.DirectoryInfo]::new($root)
while ($ancestor) {
  if ($ancestor.Exists -and ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Redirected installation directory denied' }
  $ancestor = $ancestor.Parent
}
$startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\myREWRD-TV-Box.bat'
$profile = Join-Path $env:APPDATA 'myREWRD TV Box'
if (!(Test-Path -LiteralPath (Join-Path $profile 'config.json'))) { throw 'Existing paired profile required' }
$startupText = Get-Content -LiteralPath $startup -Raw
if ($startupText -notmatch '(?im)^\s*start\s+""\s+"([^"]+)"\s*$') { throw 'Unrecognized startup entry' }
$previous = [IO.Path]::GetFullPath($Matches[1])
$allowed = @((Join-Path $root 'runtime-a\myREWRD TV Box.exe'),(Join-Path $root 'runtime-b\myREWRD TV Box.exe'))
if ($previous -notin $allowed) { throw 'Startup is outside installed runtime slots' }
$release = Get-Content -LiteralPath (Join-Path ([IO.Path]::GetDirectoryName($previous)) 'runtime-release.json') -Raw | ConvertFrom-Json
if ($release.version -ne '2.1.0') { throw 'This one-time bridge only accepts installed 2.1.0' }
$parents = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $previous -and $_.CommandLine -notmatch '--type=' })
if ($parents.Count -ne 1) { throw 'Exactly one running TV main process is required' }
$parent = Get-Process -Id $parents[0].ProcessId
$started = ([DateTimeOffset]$parent.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()
$stage = Join-Path $root ('.support-2.2.0-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
$archive = Join-Path $stage 'runtime.zip'
$hash = 'f5482aa63a05477793205c518d6ad79a4c0da1d7d86d0df0b34554669dc592dc'
if ($ArchivePath) {
  $cached = [IO.Path]::GetFullPath($ArchivePath)
  if (!$cached.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Cached archive must be inside the installation directory' }
  Copy-Item -LiteralPath $cached -Destination $archive
} else {
  Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/myREWRD/myrewrd-tv-box/releases/download/latest/myREWRD.TV.Box.2.2.0.zip' -OutFile $archive
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw 'Signed candidate checksum mismatch' }
$payload = Join-Path $stage 'payload'
Expand-Archive -LiteralPath $archive -DestinationPath $payload
$metadata = @{version='2.2.0';url='https://github.com/myREWRD/myrewrd-tv-box/releases/download/latest/myREWRD.TV.Box.2.2.0.zip';sha256=$hash;installRoot=$root;profile=$profile;startupPath=$startup;previousExe=$previous;parentExe=$previous;parentPid=$parent.Id;parentStartedAt=$started;archive=$archive;payload=$payload}
$metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'input.json') -Encoding UTF8
@'
const fs = require('original-fs'), path = require('node:path');
delete process.env.ELECTRON_RUN_AS_NODE;
const input = JSON.parse(fs.readFileSync(path.join(__dirname,'input.json'),'utf8').replace(/^\uFEFF/,''));
const { prepareUpdate } = require(path.join(input.payload,'resources','app.asar','src','update.js'));
prepareUpdate({...input,download:async(_,file)=>fs.copyFileSync(input.archive,file)})
 .then(job=>fs.writeFileSync(path.join(__dirname,'job.json'),JSON.stringify({directory:job.directory,nonce:job.nonce,version:job.version,supervisorPid:job.supervisorPid})))
 .catch(()=>{console.error('Recovery staging failed; current TV retained.');process.exitCode=1;});
'@ | Set-Content -LiteralPath (Join-Path $stage 'bridge.cjs') -Encoding UTF8
$env:ELECTRON_RUN_AS_NODE = '1'
try {
  $bridgeProcess = Start-Process -FilePath (Join-Path $payload 'myREWRD TV Box.exe') -ArgumentList ('"' + (Join-Path $stage 'bridge.cjs') + '"') -WindowStyle Hidden -PassThru
  # PowerShell does not wait for GUI executables invoked with &. Wait only for
  # this bridge process: Start-Process -Wait also waits for the supervisor tree,
  # which needs this script to stop the old TV after confirming readiness.
  if (!$bridgeProcess.WaitForExit(180000)) { throw 'Bridge preparation timed out; TV retained' }
  $bridgeExit = $bridgeProcess.ExitCode
}
finally { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
if ($bridgeExit -ne 0 -or !(Test-Path -LiteralPath (Join-Path $stage 'job.json'))) { throw 'No supervised handoff prepared; TV retained' }
$job = Get-Content -LiteralPath (Join-Path $stage 'job.json') -Raw | ConvertFrom-Json
function Read-Receipt($name) {
  $receiptPath = Join-Path $job.directory $name
  if (!(Test-Path -LiteralPath $receiptPath)) { return $null }
  $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
  if ($receipt.nonce -ne $job.nonce -or $receipt.version -ne $job.version) { throw 'Mismatched supervisor receipt' }
  return $receipt
}
$current = Get-Process -Id $parent.Id
if ($current.Path -ne $previous -or ([DateTimeOffset]$current.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds() -ne $started) { throw 'TV process identity changed; stop' }
$supervisor = Get-Process -Id $job.supervisorPid
if ($supervisor.Path -ne (Join-Path $job.directory 'supervisor.exe')) { throw 'Supervisor process identity mismatch; TV retained' }
if ((Read-Receipt 'supervisor.ready.json').phase -ne 'supervisor-ready' -or (Read-Receipt 'abort.json') -or (Read-Receipt 'result.json')) { throw 'Supervisor is no longer ready; TV retained' }
# The supervisor is ready and retains the original runtime/startup for recovery.
Stop-Process -Id $current.Id
$deadline = (Get-Date).AddSeconds(150)
do {
  if ((Read-Receipt 'complete.json').phase -eq 'complete') { Write-Host 'TV 2.2.0 supervised update complete.'; exit 0 }
  $result = Read-Receipt 'result.json'
  if ($result -and $result.phase -ne 'complete') { throw ('Supervisor recovery: '+$result.phase+'. Inspect TV before retrying.') }
  if (Read-Receipt 'abort.json') { throw 'Supervisor aborted; inspect TV recovery before retrying' }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
throw 'No completion receipt; inspect supervisor recovery. Do not retry blindly.'
