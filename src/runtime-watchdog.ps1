param([int]$ParentPid,[double]$StartedAt,[string]$Executable,[string]$HealthFile)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $env:USERPROFILE 'myREWRD-TV-Box'))
if($Executable -notin @((Join-Path $root 'runtime-a\myREWRD TV Box.exe'),(Join-Path $root 'runtime-b\myREWRD TV Box.exe'))){exit 1}
function Same-Process($value) {
 return $value -and $value.Path -eq $Executable -and [Math]::Abs(([DateTimeOffset]$value.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()-$StartedAt) -lt 1000
}
try {
 while($true){
  Start-Sleep -Seconds 10
  $process=Get-Process -Id $ParentPid -ErrorAction SilentlyContinue
  if($process -and !(Same-Process $process)){exit 0}
  if(!$process){break}
  $health=Get-Item -LiteralPath $HealthFile -ErrorAction SilentlyContinue
  if($health -and $health.LastWriteTimeUtc -gt [DateTime]::UtcNow.AddSeconds(-120)){continue}
  if((Same-Process (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue))){Stop-Process -Id $ParentPid -Force}
  break
 }
 $journal=Join-Path $env:USERPROFILE '.kuevy-reset\state.json'
 if(Test-Path -LiteralPath $journal){
  $reset=Get-Content -LiteralPath $journal -Raw|ConvertFrom-Json
  if($reset.phase -ne 'ready'){exit 0}
  if(Test-Path -LiteralPath $HealthFile){
   $last=Get-Content -LiteralPath $HealthFile -Raw|ConvertFrom-Json
   if($reset.manifest_version -eq 1 -and $last.phase -eq 'provisioning' -and $last.startedAt -eq $StartedAt -and $last.at -gt [DateTimeOffset]::UtcNow.AddMinutes(-2).ToUnixTimeMilliseconds()){exit 0}
  }
 }
 # Yield to the signed updater and any replacement main process.
 for($n=0;$n -lt 30;$n++){
  $live=@(Get-CimInstance Win32_Process|Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)})
  if(!$live.Count){break};Start-Sleep -Seconds 2
 }
 if($live.Count){exit 0}
 $failures=Join-Path $root '.watchdog-failures.json'
 $recent=@();if(Test-Path -LiteralPath $failures){$recent=@((Get-Content -LiteralPath $failures -Raw|ConvertFrom-Json)|Where-Object {$_ -gt [DateTimeOffset]::UtcNow.AddMinutes(-15).ToUnixTimeMilliseconds()})}
 if($recent.Count -ge 3){exit 1}
 $recent+=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();[IO.File]::WriteAllText($failures,(ConvertTo-Json -InputObject $recent -Compress))
 Start-Sleep -Seconds 10
 $startup=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\myREWRD-TV-Box.bat'
 $text=Get-Content -LiteralPath $startup -Raw
 if($text -notmatch '(?im)^\s*start\s+""\s+"([^"]+)"\s*$'){exit 1}
 $target=$Matches[1]
 if($target -notin @((Join-Path $root 'runtime-a\myREWRD TV Box.exe'),(Join-Path $root 'runtime-b\myREWRD TV Box.exe'))){exit 1}
 Start-Process -FilePath $target -WindowStyle Hidden
} catch {exit 1}
