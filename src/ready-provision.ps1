# Included in the pinned installer. Applies only to already-clean Ready boxes.
function Update-KuevyReadyRuntime {
 param([string]$Root,[string]$Startup,[string]$Archive,[string]$Version,[string]$ArchiveHash,[string]$AsarHash,[string]$HelperHash)
 function Plain-Ready([string]$Path) {
  $full=[IO.Path]::GetFullPath($Path)
  if(!$full.StartsWith([IO.Path]::GetFullPath($env:USERPROFILE)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Ready path outside dedicated profile'}
  for($cursor=$full;$cursor;$cursor=[IO.Path]::GetDirectoryName($cursor)){if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected Ready path denied'}}
  if(Test-Path -LiteralPath $full -PathType Container){foreach($entry in Get-ChildItem -LiteralPath $full -Recurse -Force){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected Ready child denied'}}}
 }
 $journal=Join-Path $env:USERPROFILE '.kuevy-reset\state.json'
 function Clean-Ready {
  foreach($target in @($Root,$journal,$Startup,(Join-Path $env:APPDATA 'myREWRD TV Box'),(Join-Path $env:APPDATA 'myrewrd-tv-box'))){Plain-Ready $target}
  $state=Get-Content -LiteralPath $journal -Raw|ConvertFrom-Json
  if($state.manifest_version -ne 1 -or $state.phase -ne 'ready' -or $state.device_id -notmatch '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'){throw 'Completed Ready cleanup required before runtime refresh'}
  foreach($folder in @($Root,(Join-Path $Root 'runtime-a'),(Join-Path $Root 'runtime-b'),(Join-Path $env:APPDATA 'myREWRD TV Box'),(Join-Path $env:APPDATA 'myrewrd-tv-box'))){foreach($name in @('config.json','reset-key.enc','presentation-key.enc','presentation-key.json')){if(Test-Path -LiteralPath (Join-Path $folder $name)){throw 'Ready runtime refresh requires cleared installation state'}}}
  return $state
 }
 function Idle-Ready {
  $running=@(Get-CimInstance Win32_Process|Where-Object {($_.ExecutablePath -and $_.ExecutablePath.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)) -or ($_.Name -eq 'powershell.exe' -and $_.CommandLine -like ('*'+$Root+'*runtime-watchdog.ps1*'))})
  if($running.Count){throw 'Close Ready runtime and its supervisor before refresh; installation preserved'}
 }
 function File-Hash([string]$Path){Plain-Ready $Path;return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
 function Close-OlderReady {
  # Compatibility is attended and never force-terminates the TV application.
  $current=Clean-Ready
  if([Convert]::ToBase64String($journalBytes) -ne [Convert]::ToBase64String([IO.File]::ReadAllBytes($journal)) -or [Convert]::ToBase64String($startupBytes) -ne [Convert]::ToBase64String([IO.File]::ReadAllBytes($Startup))){throw 'Ready state changed before attended close'}
  $main=@(Get-Process|Where-Object {try{$_.Path -eq $active -and $_.MainWindowHandle -ne 0}catch{$false}})
  if($main.Count -ne 1){throw 'A single visible owned Ready application is required for attended upgrade'}
  $owner=$main[0];$stamp=([DateTimeOffset]$owner.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()
  $script=Join-Path $activeFolder 'resources\app.asar.unpacked\src\runtime-watchdog.ps1'
  $health=Join-Path $Root ('.health\'+$owner.Id+'.json');Plain-Ready $script;Plain-Ready $health
  $bridge=Join-Path $activeFolder 'resources\app.asar.unpacked\src\maintenance-launcher.exe';Plain-Ready $bridge
  if(!(Test-Path -LiteralPath $bridge -PathType Leaf) -or !(Test-Path -LiteralPath $script -PathType Leaf)){throw 'Older Ready recovery bridge is missing; no processes closed'}
  $bridgeItem=Get-Item -LiteralPath $bridge
  if($bridgeItem.Length -lt 64 -or $bridgeItem.Length -gt 1048576){throw 'Unsupported older Ready recovery bridge'}
  $bytes=[IO.File]::ReadAllBytes($bridge);$offset=[BitConverter]::ToUInt32($bytes,60)
  if($bytes[0] -ne 77 -or $bytes[1] -ne 90 -or $offset -gt $bytes.Length-4 -or [Text.Encoding]::ASCII.GetString($bytes,$offset,4) -ne "PE`0`0"){throw 'Unsupported older Ready recovery bridge'}
  $bridgeHash=File-Hash $bridge;$scriptHash=File-Hash $script
  $pattern='^"'+[regex]::Escape((Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'))+'" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+[regex]::Escape($script)+'" -ParentPid '+$owner.Id+' -StartedAt "([0-9]+(?:\.[0-9]+)?)" -Executable "'+[regex]::Escape($active)+'" -HealthFile "'+[regex]::Escape($health)+'"$'
  $watch=@(Get-CimInstance Win32_Process|Where-Object {$_.CommandLine -match $pattern -and [Math]::Abs([double]$Matches[1]-$stamp) -lt 1000})
  if($watch.Count -ne 1){throw 'A uniquely matched Ready supervisor is required; no processes closed'}
  $supervisor=Get-Process -Id $watch[0].ProcessId -ErrorAction Stop
  if($supervisor.Path -ine (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')){throw 'Unexpected Ready supervisor executable'}
  Add-Type -AssemblyName System.Windows.Forms
  $answer=[Windows.Forms.MessageBox]::Show('This clean Ready box uses older KUEVY software. Close only its Ready application and matching recovery supervisor so setup can install the verified release? Windows, network, remote support and reset history will be preserved.','KUEVY TV setup',[Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Information)
  if($answer -ne [Windows.Forms.DialogResult]::Yes){throw 'Attended Ready upgrade cancelled; installation preserved'}
  $null=Clean-Ready
  if([Convert]::ToBase64String($journalBytes) -ne [Convert]::ToBase64String([IO.File]::ReadAllBytes($journal)) -or [Convert]::ToBase64String($startupBytes) -ne [Convert]::ToBase64String([IO.File]::ReadAllBytes($Startup))){throw 'Ready state changed during confirmation'}
  $again=Get-Process -Id $owner.Id -ErrorAction Stop
  $watchAgain=Get-Process -Id $supervisor.Id -ErrorAction Stop
  $command=Get-CimInstance Win32_Process -Filter ('ProcessId='+$supervisor.Id)
  if($again.Path -ine $active -or $again.StartTime -ne $owner.StartTime -or $watchAgain.StartTime -ne $supervisor.StartTime -or $command.CommandLine -notmatch $pattern -or [Math]::Abs([double]$Matches[1]-$stamp) -ge 1000){throw 'Ready process ownership changed; no processes closed'}
  if((File-Hash $bridge) -ne $bridgeHash -or (File-Hash $script) -ne $scriptHash){throw 'Older Ready recovery files changed; no processes closed'}
  Stop-Process -InputObject $watchAgain -Force
  try {
   if(!$again.CloseMainWindow()){throw 'Ready application refused normal close'}
   if(!$again.WaitForExit(15000)){throw 'Ready application did not exit normally'}
  } catch {
   # Restore crash recovery if normal application close failed.
   $still=Get-Process -Id $owner.Id -ErrorAction SilentlyContinue
   if($still -and $still.Path -ieq $active -and $still.StartTime -eq $owner.StartTime){
    if((File-Hash $bridge) -ne $bridgeHash -or (File-Hash $script) -ne $scriptHash){throw 'Older Ready recovery changed; attended recovery required'}
    Start-Process -FilePath $bridge -ArgumentList @('watchdog',[string]$owner.Id,[string]$stamp,('"'+$active+'"'),('"'+$health+'"')) -WindowStyle Hidden
    $restored=$false
    for($n=0;$n -lt 10;$n++){$restored=@(Get-CimInstance Win32_Process|Where-Object {$_.ProcessId -ne $supervisor.Id -and $_.CommandLine -match $pattern -and [Math]::Abs([double]$Matches[1]-$stamp) -lt 1000}).Count -eq 1;if($restored){break};Start-Sleep -Milliseconds 500}
    if(!$restored){throw 'Older Ready supervisor restoration was not verified; attended recovery required'}
   }
   throw
  }
 }
 function Yield-Ready {
  $live=@(Get-Process|Where-Object {try{$_.Path -eq $active}catch{$false}})
  if($live.Count){Start-Process -FilePath $active -ArgumentList '--kuevy-provision-ready' -WindowStyle Hidden;for($n=0;$n -lt 25;$n++){if(!@(Get-Process|Where-Object {try{$_.Path -eq $active}catch{$false}}).Count){break};Start-Sleep -Seconds 1};if(@(Get-Process|Where-Object {try{$_.Path -eq $active}catch{$false}}).Count){Close-OlderReady}}
  # The supervisor checks its parent every ten seconds; allow its bounded exit.
  for($n=0;$n -lt 12;$n++){try{Idle-Ready;break}catch{if($n -eq 11){throw};Start-Sleep -Seconds 1}}
 }
 function Unchanged-Ready {
  $current=Clean-Ready;Idle-Ready
  if($current.device_id -ne $before.device_id -or $current.id -ne $before.id -or $current.api_origin -ne $before.api_origin -or [Convert]::ToBase64String($journalBytes) -ne [Convert]::ToBase64String([IO.File]::ReadAllBytes($journal)) -or [Convert]::ToBase64String($startupBytes) -ne [Convert]::ToBase64String([IO.File]::ReadAllBytes($Startup))){throw 'Ready state changed during staging'}
 }
 $before=Clean-Ready
 $journalBytes=[IO.File]::ReadAllBytes($journal)
 $startupBytes=[IO.File]::ReadAllBytes($Startup)
 $text=[Text.Encoding]::UTF8.GetString($startupBytes)
 if($text -notmatch '(?is)^\s*@echo off\s*\r?\n\s*start\s+""\s+"([^"]+)"\s*$'){throw 'Recognized Ready launcher required'}
 $active=Get-CanonicalRuntimePath $Matches[1]
 $slot=$null
 foreach($name in @('runtime-a','runtime-b')){$candidate=Join-Path $Root ($name+'\myREWRD TV Box.exe');if((Test-Path -LiteralPath $candidate -PathType Leaf) -and $active.Equals((Get-CanonicalRuntimePath $candidate),[StringComparison]::OrdinalIgnoreCase)){$slot=$name}}
 if(!$slot){throw 'Owned Ready runtime required'}
 $activeFolder=Join-Path $Root $slot
 $release=Get-Content -LiteralPath (Join-Path $activeFolder 'runtime-release.json') -Raw|ConvertFrom-Json
 if($release.layout -ne 'installed-ab-v1' -or $release.version -notmatch '^\d+\.\d+\.\d+$'){throw 'Known Ready runtime layout required'}
 if($release.version -eq $Version -and (File-Hash (Join-Path $activeFolder 'resources\app.asar')) -eq $AsarHash -and (File-Hash (Join-Path $activeFolder 'resources\app.asar.unpacked\src\maintenance-launcher.exe')) -eq $HelperHash){Yield-Ready;Unchanged-Ready;return}
 $inactive=Join-Path $Root $(if($slot -eq 'runtime-a'){'runtime-b'}else{'runtime-a'})
 if(Test-Path -LiteralPath $inactive){$old=Get-Content -LiteralPath (Join-Path $inactive 'runtime-release.json') -Raw|ConvertFrom-Json;if($old.layout -ne 'installed-ab-v1' -or $old.version -notmatch '^\d+\.\d+\.\d+$'){throw 'Unknown inactive runtime requires attended repair'}}
 $stage=Join-Path $Root ('.ready-provision-'+[Guid]::NewGuid().ToString('N'));Plain-Ready $stage
 [IO.Directory]::CreateDirectory($stage)|Out-Null
 $zip=Join-Path $stage 'runtime.zip'
 if($Archive){Plain-Ready $Archive;Copy-Item -LiteralPath $Archive -Destination $zip}
 else{Invoke-WebRequest -UseBasicParsing -Uri ('https://github.com/myREWRD/myrewrd-tv-box/releases/download/latest/myREWRD.TV.Box.'+$Version+'.zip') -OutFile $zip}
 $payload=Join-Path $stage 'payload'
 ExpandVerifiedRuntime -ArchivePath $zip -Destination $payload -ExpectedHash $ArchiveHash -ExpectedVersion $Version
 if((File-Hash (Join-Path $payload 'resources\app.asar')) -ne $AsarHash -or (File-Hash (Join-Path $payload 'resources\app.asar.unpacked\src\maintenance-launcher.exe')) -ne $HelperHash){throw 'Accepted Ready runtime content pins required'}
 # The accepted Ready runtime can yield to local setup without watchdog relaunch.
 Yield-Ready;Unchanged-Ready
 $retained=Join-Path $Root ('.retained-ready-'+[Guid]::NewGuid().ToString('N'));Plain-Ready $retained
 $moved=$false;$installed=$false;$switched=$false
 try {
  if(Test-Path -LiteralPath $inactive){[IO.Directory]::Move($inactive,$retained);$moved=$true}
  [IO.Directory]::Move($payload,$inactive)
  $installed=$true
  $temporary=Join-Path $stage 'startup.next';Plain-Ready $temporary
  [IO.File]::WriteAllText($temporary,('@echo off'+"`r`n"+'start "" "'+(Join-Path $inactive 'myREWRD TV Box.exe')+'"'+"`r`n"),[Text.UTF8Encoding]::new($false))
  Plain-Ready $Startup;[IO.File]::Replace($temporary,$Startup,(Join-Path $stage 'startup.before'));$switched=$true
 } catch {
  if(!$switched){if($installed){[IO.Directory]::Move($inactive,$payload)};if($moved){[IO.Directory]::Move($retained,$inactive)}}
  throw
 }
 Write-Host 'Accepted Ready runtime staged. Prior runtime, reset history, Windows and remote support preserved.'
}
