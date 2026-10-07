param([int]$ParentPid)
$ErrorActionPreference='Stop'
$root=Join-Path $env:USERPROFILE 'myREWRD-TV-Box'
$all=@(Get-CimInstance Win32_Process)
$main=$all|Where-Object {$_.ProcessId -eq $ParentPid}|Select-Object -First 1
function Owned-ElectronChild($Value) {
 if(!$main -or $Value.ExecutablePath -ne $main.ExecutablePath -or $Value.CommandLine -notmatch '--type=(renderer|gpu-process|utility|crashpad-handler)\b'){return $false}
 $cursor=$Value
 for($n=0;$n -lt 16;$n++) {
  if($cursor.ParentProcessId -eq $ParentPid){return $true}
  $cursor=$all|Where-Object {$_.ProcessId -eq $cursor.ParentProcessId}|Select-Object -First 1
  if(!$cursor){break}
 }
 return $false
}
$processes=@($all|Where-Object {$_.ProcessId -ne $ParentPid -and !(Owned-ElectronChild $_) -and (($_.ExecutablePath -and $_.ExecutablePath.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)) -or ($_.CommandLine -and $_.CommandLine -match '(?i)myrewrd.*(?:update|install|supervisor|save-wifi)'))})
if($processes.Count){throw 'Wait for all TV update/installer processes to finish'}
foreach($scope in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Run','HKLM:\Software\Microsoft\Windows\CurrentVersion\Run')) {
 if(Test-Path $scope){foreach($name in (Get-Item $scope).GetValueNames()){if($name -match '(?i)kuevy|myrewrd'){throw 'Attended removal of legacy KUEVY Run entry required'}}}
}
if(@(Get-ScheduledTask -ErrorAction Stop|Where-Object {$_.TaskName -match '(?i)kuevy|myrewrd'}).Count){throw 'Attended removal of legacy KUEVY scheduled task required'}
$startup=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\myREWRD-TV-Chrome.bat'
if(Test-Path -LiteralPath $startup){throw 'Legacy browser/profile ownership review required before cleanup'}
