function Get-KuevySetupCopies($State) {
 $targets=@()
 foreach($location in @('Desktop','Downloads')) {
  $folder=Join-Path $env:USERPROFILE $location
  Assert-Plain $folder|Out-Null
  if(!(Test-Path -LiteralPath $folder)){continue}
  foreach($file in Get-ChildItem -LiteralPath $folder -File) {
   if($file.Name -notmatch '^(?:myREWRD-TV-Setup-|KUEVY-Reset-|myREWRD-Reset-)'){continue}
   Assert-Plain $file.FullName|Out-Null
   if($file.Length -gt 2000000){throw 'Attended setup-copy ownership review required'}
   $text=[IO.File]::ReadAllText($file.FullName)
   if($text -match 'set "CONFIG_B64=([A-Za-z0-9+/=]+)"') {
    try{$configuration=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Matches[1]))|ConvertFrom-Json}catch{throw 'Unverified setup copy requires attended review'}
    if($configuration.deviceId -eq $State.device_id){$targets+=$file.FullName}
   }elseif($file.Name -match [regex]::Escape($State.device_id)){$targets+=$file.FullName}
   else{throw 'Legacy setup copy requires attended ownership review'}
  }
 }
 return $targets
}
