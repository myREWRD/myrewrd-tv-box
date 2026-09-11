#Requires -RunAsAdministrator
param([switch]$NoRestart)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = "$PSHOME\Modules"
if ([Security.Principal.WindowsIdentity]::GetCurrent().Name -ine ($env:COMPUTERNAME+'\myrewrd')) { throw 'Run under the dedicated myrewrd Windows account as administrator.' }
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class TVRuntimePaths {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern uint GetLongPathName(string path, StringBuilder buffer, uint size);
}
"@
function Get-CanonicalRuntimePath([string]$value) {
  $buffer = [Text.StringBuilder]::new(32768)
  $length = [TVRuntimePaths]::GetLongPathName([IO.Path]::GetFullPath($value),$buffer,32768)
  if (!$length -or $length -ge 32768) { throw 'Cannot resolve installed runtime path' }
  return $buffer.ToString()
}
$version = '@VERSION@'
$runtimeHash = '@HASH@'
$root = Join-Path $env:USERPROFILE 'myREWRD-TV-Box'
$root = [IO.Path]::GetFullPath($root)
$parent = [IO.DirectoryInfo]::new($root)
while ($parent) {
  if ($parent.Exists -and ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Redirected installation directory denied' }
  $parent = $parent.Parent
}
[IO.Directory]::CreateDirectory($root) | Out-Null
$root = Get-CanonicalRuntimePath $root
$marker = Join-Path $root 'installed-runtime.json'
$alreadyInstalled = $false
$startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\myREWRD-TV-Box.bat'
if (Test-Path -LiteralPath $marker) {
  try {
    $installed = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
    $startupText = Get-Content -LiteralPath $startup -Raw
    $startupExecutable = $null
    if ($startupText -match '(?im)^\s*start\s+""\s+"([^"]+)"\s*$') {
      $startupExecutable = Get-CanonicalRuntimePath $Matches[1]
    }
    foreach ($slot in @('runtime-a','runtime-b')) {
      $exe = Join-Path $root ($slot+'\myREWRD TV Box.exe')
      $releasePath = Join-Path $root ($slot+'\runtime-release.json')
      if ($installed.layout -eq 'installed-ab-v1' -and $startupExecutable -and (Test-Path -LiteralPath $exe) -and (Test-Path -LiteralPath $releasePath) -and $startupExecutable.Equals((Get-CanonicalRuntimePath $exe),[StringComparison]::OrdinalIgnoreCase)) {
        $release = Get-Content -LiteralPath $releasePath -Raw | ConvertFrom-Json
        if ($release.layout -eq 'installed-ab-v1') { $alreadyInstalled = $true }
      }
    }
  } catch { $alreadyInstalled = $false }
}
foreach ($slot in @('runtime-a','runtime-b')) {
  $slotPath = Join-Path $root $slot
  if ((Test-Path -LiteralPath $slotPath) -and ((Get-Item -LiteralPath $slotPath).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Redirected runtime slot denied' }
}
if (!$alreadyInstalled) {
  if (!$NoRestart -and !(Test-Path -LiteralPath (Join-Path $env:APPDATA 'myREWRD TV Box\config.json'))) { throw 'Use the dashboard setup script to provision a new box first.' }
  $runtime = Join-Path $root 'runtime-a'
  $resume = Test-Path -LiteralPath $runtime
  if ($resume) {
    $existingRelease = Get-Content -LiteralPath (Join-Path $runtime 'runtime-release.json') -Raw | ConvertFrom-Json
    if ($existingRelease.layout -ne 'installed-ab-v1' -or $existingRelease.version -ne $version -or !(Test-Path -LiteralPath (Join-Path $runtime 'resources\app.asar')) -or !(Test-Path -LiteralPath (Join-Path $runtime 'myREWRD TV Box.exe'))) { throw 'Existing runtime is not a resumable installation. No files replaced.' }
  }
  $stage = Join-Path $root ('.install-'+[Guid]::NewGuid().ToString('N'))
  [IO.Directory]::CreateDirectory($stage) | Out-Null
  if (!$resume) {
  $zip = Join-Path $stage 'runtime.zip'
  Invoke-WebRequest -UseBasicParsing -Uri ('https://github.com/myREWRD/myrewrd-tv-box/releases/download/latest/myREWRD.TV.Box.'+$version+'.zip') -OutFile $zip
  ExpandVerifiedRuntime -ArchivePath $zip -Destination (Join-Path $stage 'payload') -ExpectedHash $runtimeHash -ExpectedVersion $version
  }
}
# Stable exact-program rules: updates alternate slots without changing these paths.
foreach ($slot in @('runtime-a','runtime-b')) {
  foreach ($protocol in @('TCP','UDP')) {
    $name = 'myREWRD-TV-Presentation-'+$slot+'-'+$protocol
    Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -Name $name -DisplayName ('myREWRD TV local presentation '+$slot+' '+$protocol) -Direction Inbound -Action Allow -Program (Join-Path $root ($slot+'\myREWRD TV Box.exe')) -Protocol $protocol -Profile Any -RemoteAddress LocalSubnet -EdgeTraversalPolicy Block -Enabled True | Out-Null
  }
}
if ($alreadyInstalled) {
  if (!$NoRestart) { [IO.File]::WriteAllText((Join-Path $root 'provisioning-complete.json'),'{"complete":true}') }
  Write-Host 'Permanent firewall rules repaired. Installed runtimes, startup and receiver keys were preserved.'
  exit 0
}
$startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\myREWRD-TV-Box.bat'
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($startup)) | Out-Null
$previousStartup = if (Test-Path -LiteralPath $startup) { [IO.File]::ReadAllBytes($startup) } else { $null }
if ($previousStartup) { [IO.File]::WriteAllBytes((Join-Path $stage 'startup.before'),$previousStartup) }
if (!$resume) { [IO.Directory]::Move((Join-Path $stage 'payload'),$runtime) }
try {
  $startupTemp = $startup+'.install.tmp'
  [IO.File]::WriteAllText($startupTemp,('@echo off'+"`r`n"+'start "" "'+(Join-Path $runtime 'myREWRD TV Box.exe')+'"'+"`r`n"),[Text.UTF8Encoding]::new($false))
  if (Test-Path -LiteralPath $startup) { [IO.File]::Replace($startupTemp,$startup,(Join-Path $stage 'startup.replaced.bak')) } else { [IO.File]::Move($startupTemp,$startup) }
  [IO.File]::WriteAllText(($marker+'.tmp'),('{"layout":"installed-ab-v1","initialVersion":"'+$version+'"}'))
  if (Test-Path -LiteralPath $marker) { [IO.File]::Replace(($marker+'.tmp'),$marker,(Join-Path $stage 'marker.replaced.bak')) } else { [IO.File]::Move(($marker+'.tmp'),$marker) }
} catch {
  if ($previousStartup) { [IO.File]::WriteAllBytes($startup,$previousStartup) }
  elseif (Test-Path -LiteralPath $startup) { Remove-Item -LiteralPath $startup }
  throw
}
Write-Host 'Installed permanent runtime paths and local-network firewall rules. Existing AppData, receiver key and configuration are preserved.'
if (!$NoRestart) {
  [IO.File]::WriteAllText((Join-Path $root 'provisioning-complete.json'),'{"complete":true}')
  Write-Host 'Restarting the dedicated TV box in 15 seconds to complete migration.'
  & shutdown.exe /r /t 15 /c 'myREWRD TV permanent runtime migration complete'
  if ($LASTEXITCODE -ne 0) { throw 'Installation is ready. Restart Windows to complete migration.' }
}
