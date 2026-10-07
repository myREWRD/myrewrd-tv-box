param([Parameter(Mandatory)][string]$Journal,[int]$ParentPid,[string]$Executable)
$ErrorActionPreference='Stop'
function Assert-Plain([string]$Path) {
 $full=[IO.Path]::GetFullPath($Path)
 if (!$full.StartsWith([IO.Path]::GetFullPath($env:USERPROFILE)+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup outside dedicated profile denied' }
 $cursor=$full
 while($cursor) {if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected cleanup denied'};$cursor=[IO.Path]::GetDirectoryName($cursor)}
 if(Test-Path -LiteralPath $full -PathType Container) {foreach($entry in Get-ChildItem -LiteralPath $full -Recurse -Force){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cleanup denied'}}}
 return $full
}
try {
 Assert-Plain $Journal | Out-Null
 $state=Get-Content -LiteralPath $Journal -Raw | ConvertFrom-Json
 if($state.manifest_version -ne 1 -or $state.phase -ne 'retired' -or $state.device_id -notmatch '^[a-f0-9-]{36}$'){throw 'Verified server retirement required'}
 $root=Join-Path $env:USERPROFILE 'myREWRD-TV-Box'
 $exe=Assert-Plain $Executable
 if($exe -notin @((Join-Path $root 'runtime-a\myREWRD TV Box.exe'),(Join-Path $root 'runtime-b\myREWRD TV Box.exe'))){throw 'Unknown runtime denied'}
 # Wait for the exact parent to leave. Never kill an unrelated recycled process.
 for($n=0;$n -lt 30 -and (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue);$n++){Start-Sleep -Milliseconds 500}
 if(Get-Process -Id $ParentPid -ErrorAction SilentlyContinue){throw 'TV process did not exit'}
 $profiles=@((Join-Path $env:APPDATA 'myREWRD TV Box'),(Join-Path $env:APPDATA 'myrewrd-tv-box'))
 $fallbacks=@((Join-Path $root 'runtime-a'),(Join-Path $root 'runtime-b'))
 $startup=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
 $targets=$profiles+@((Join-Path $root 'config.json'),(Join-Path $root 'presentation-key.json'),(Join-Path $root 'provisioning-complete.json'),(Join-Path $root '.updates'),(Join-Path $root 'update-failure.json'))
 foreach($slot in $fallbacks){foreach($name in @('config.json','presentation-key.json')){$targets+=Join-Path $slot $name}}
 foreach($name in @('myREWRD-TV-Chrome.bat','myREWRD-TV.bat','myREWRD-TV-Box.bat')){$targets+=Join-Path $startup $name}
 . (Join-Path ([IO.Path]::GetDirectoryName($Journal)) 'reset-owned-copies.ps1')
 $targets+=Get-KuevySetupCopies $state
 foreach($target in $targets){Assert-Plain $target | Out-Null}
 $running=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)})
 if($running.Count){throw 'TV or updater process still running'}
 & (Join-Path ([IO.Path]::GetDirectoryName($Journal)) 'assert-reset-idle.ps1') -ParentPid $ParentPid
 foreach($profile in ($profiles+@($root)+$fallbacks)){$config=Join-Path $profile 'config.json';if(Test-Path -LiteralPath $config){$value=Get-Content -LiteralPath $config -Raw|ConvertFrom-Json;if($state.token_hash){
 $sha=[Security.Cryptography.SHA256]::Create();try{$hash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($value.tvToken)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 if($hash -ne $state.token_hash -or ($value.deviceId -and $value.deviceId -ne $state.device_id) -or $value.venueId -ne $state.venue_id){throw 'Conflicting pairing denied'}
 }elseif($value.deviceId -ne $state.device_id){throw 'Conflicting pairing denied'}}}
 foreach($target in $targets){if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Recurse -Force};if(Test-Path -LiteralPath $target){throw 'Local cleanup incomplete'}}
 # Generic browser profiles, networks, drivers and remote-support services are untouched.
 [IO.Directory]::CreateDirectory($startup)|Out-Null
 [IO.File]::WriteAllText((Join-Path $startup 'myREWRD-TV-Box.bat'),('@echo off'+"`r`n"+'start "" "'+$exe+'"'+"`r`n"))
 if(!(Test-Path -LiteralPath (Join-Path $startup 'myREWRD-TV-Box.bat'))){throw 'Ready startup missing'}
 $state.phase='ready'
 [IO.File]::WriteAllText(($Journal+'.tmp'),($state|ConvertTo-Json -Compress))
 Move-Item -LiteralPath ($Journal+'.tmp') -Destination $Journal -Force
 Start-Process -FilePath $exe -WindowStyle Hidden
} catch { exit 1 }
