$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\src\remote-status.ps1')
$script:mode = 'running'
function Get-Item { param($LiteralPath,$ErrorAction)
  if ($script:mode -eq 'denied') { throw 'fixture access denied' }
  if ($script:mode -eq 'absent') { throw [System.Management.Automation.ItemNotFoundException]::new('fixture absent') }
  return @{FullName=$LiteralPath;PSIsContainer=$true}
}
function Get-AuthenticodeSignature { param($LiteralPath)
  if($script:mode -eq 'unsigned'){return @{Status='NotSigned'}}
  return @{Status='Valid';SignerCertificate=@{Subject='CN=Google LLC, O=Google LLC, C=US'}}
}
function Get-ChildItem { param($LiteralPath,$Filter,[switch]$File,$ErrorAction)
  if($Filter -ne 'host*.json'){throw 'Unexpected inspection'}
  return @{Name='host-fixture.json'}
}
function Get-Content { throw 'Host configuration contents must never be read' }
function Get-Service { param($Name,$ErrorAction)
  if($Name -ne 'chromoting'){throw 'Wrong service'}
  if($script:mode -eq 'denied'){throw 'fixture service denied'}
  if($script:mode -eq 'absent'){Write-Error 'fixture missing service' -ErrorId 'NoServiceFoundForGivenName' -ErrorAction Stop}
  return @{Status= $(if($script:mode -eq 'stopped'){'Stopped'}else{'Running'})}
}
foreach($case in @('running','stopped','denied','absent','unsigned')) {
  $script:mode=$case;$value=Get-RemoteStatus
  if($case -eq 'running' -and (!$value.host_installed -or !$value.registration_present -or $value.service_state -ne 'running')){throw 'Running probe failed'}
  if($case -eq 'stopped' -and $value.service_state -ne 'stopped'){throw 'Stopped probe failed'}
  if($case -eq 'denied' -and ($null -ne $value.host_installed -or $null -ne $value.registration_present -or $value.service_state -ne 'unknown')){throw 'Denied must be unknown'}
  if($case -eq 'absent' -and ($value.host_installed -ne $false -or $value.registration_present -ne $false -or $value.service_state -ne 'missing')){throw 'Absent must be false/missing'}
  if($case -eq 'unsigned' -and $null -ne $value.host_installed){throw 'Untrusted host must be unknown'}
  Write-Host "PASS mocked Windows status probe: $case"
}
