# Attended office-only transition. No Windows/network/remote-support changes.
$ErrorActionPreference='Stop'
function Assert-OfficePlain([string]$Path) {
 $full=[IO.Path]::GetFullPath($Path)
 if(!$full.StartsWith([IO.Path]::GetFullPath($env:USERPROFILE)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Path outside dedicated user denied'}
 for($cursor=$full;$cursor;$cursor=[IO.Path]::GetDirectoryName($cursor)){
  if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected office state denied'}
 }
 if(Test-Path -LiteralPath $full -PathType Container){foreach($entry in Get-ChildItem -LiteralPath $full -Recurse -Force){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected office state denied'}}}
 return $full
}
try {
 if((Read-Host 'Type FINISH OFFICE TEST to remove this completed synthetic connection') -cne 'FINISH OFFICE TEST'){throw 'Office transition cancelled'}
 $root=Join-Path $env:USERPROFILE 'myREWRD-TV-Box'
 $reset=Join-Path $env:USERPROFILE '.kuevy-reset'
 $context=Join-Path $env:USERPROFILE '.kuevy-acceptance'
 $journal=Join-Path $reset 'state.json'
 $archive=Join-Path $reset 'office-complete.json'
 $profiles=@((Join-Path $env:APPDATA 'myREWRD TV Box'),(Join-Path $env:APPDATA 'myrewrd-tv-box'))
 foreach($target in @($root,$reset,$context)+$profiles){Assert-OfficePlain $target|Out-Null}
 $marker=Get-Content -LiteralPath (Join-Path $context 'enrolled.json') -Raw|ConvertFrom-Json
 if($marker.schema -ne 1 -or $marker.environment -ne 'preview' -or $marker.databaseRef -ne 'rwcpejpazuomogzvbwfy' -or $marker.origin -notmatch '^https://ssdt-dashboard-[a-z0-9]+-byvenuecreative\.vercel\.app$'){throw 'Verified office context required'}
 $source=if(Test-Path -LiteralPath $journal){$journal}else{$archive}
 $state=Get-Content -LiteralPath $source -Raw|ConvertFrom-Json
 if($state.manifest_version -ne 1 -or $state.phase -ne 'ready' -or $state.recovery -or $state.api_origin -ne $marker.origin -or $state.device_id -notmatch '^[a-f0-9-]{36}$'){throw 'Completed acknowledged synthetic retirement and Ready required'}
 $running=@(Get-CimInstance Win32_Process|Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)})
 if($running.Count){throw 'Close KUEVY and its updater before finishing office acceptance'}
 & (Join-Path $reset 'assert-reset-idle.ps1') -ParentPid 0
 $folders=$profiles+@($root,(Join-Path $root 'runtime-a'),(Join-Path $root 'runtime-b'))
 foreach($folder in $folders){foreach($name in @('config.json','presentation-key.json','reset-key.enc','provisioning-complete.json')){if(Test-Path -LiteralPath (Join-Path $folder $name)){throw 'Local pairing/key state remains; complete Reset KUEVY TV first'}}}
 # Retain the acknowledged, credential-free retirement attribution. Copy first
 # permits retry after interruption while the office marker blocks production.
 if($source -ne $archive){
  $pending=$archive+'.tmp'
  [IO.File]::WriteAllText($pending,($state|ConvertTo-Json -Compress))
  Move-Item -LiteralPath $pending -Destination $archive -Force
 }
 foreach($profile in $profiles){if(Test-Path -LiteralPath $profile){Remove-Item -LiteralPath $profile -Recurse -Force}}
 if(Test-Path -LiteralPath $journal){Remove-Item -LiteralPath $journal -Force}
 foreach($name in @('context.enc','context.enc.tmp')){$file=Join-Path $context $name;if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}}
 # Last: an interrupted transition cannot silently adopt production credentials.
 Remove-Item -LiteralPath (Join-Path $context 'enrolled.json') -Force
 Write-Output 'Office connection removed. Use normal KUEVY provisioning for a fresh venue installation.'
} catch {Write-Error 'Office transition stopped. Preserve the box and request attended support.';exit 1}
