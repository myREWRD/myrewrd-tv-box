$ErrorActionPreference = 'Stop'
$env:PSModulePath = "$PSHOME\Modules"
function Get-RemoteStatus {
  $hostInstalled = $null
  $registration = $null
  $serviceState = 'unknown'
  $hostPath = Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome Remote Desktop\CurrentVersion\remoting_start_host.exe'
  try {
    $file = Get-Item -LiteralPath $hostPath -ErrorAction Stop
    $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
    if ($signature.Status -eq 'Valid' -and $signature.SignerCertificate.Subject -match '(^|,\s*)O=Google (LLC|Inc\.)(,|$)') { $hostInstalled = $true }
  } catch [System.Management.Automation.ItemNotFoundException] { $hostInstalled = $false }
  catch { $hostInstalled = $null }
  try {
    $directory = Get-Item -LiteralPath (Join-Path $env:ProgramData 'Google\Chrome Remote Desktop') -ErrorAction Stop
    if (!$directory.PSIsContainer) { throw 'Unexpected registration location' }
    # Presence only. Never open Google host configuration or enumerate its contents.
    $registration = @(Get-ChildItem -LiteralPath $directory.FullName -Filter 'host*.json' -File -ErrorAction Stop).Count -gt 0
  } catch [System.Management.Automation.ItemNotFoundException] { $registration = $false }
  catch { $registration = $null }
  try {
    # Verified in the official Google host MSI ServiceInstall table, 2026-09-12.
    $service = Get-Service -Name 'chromoting' -ErrorAction Stop
    if ($service.Status -eq 'Running') { $serviceState = 'running' }
    elseif ($service.Status -eq 'Stopped') { $serviceState = 'stopped' }
  } catch {
    if ($_.FullyQualifiedErrorId -like 'NoServiceFoundForGivenName*') { $serviceState = 'missing' }
  }
  return @{ host_installed=$hostInstalled; registration_present=$registration; service_state=$serviceState; reporter_version='1' }
}
if ($MyInvocation.InvocationName -ne '.') { Get-RemoteStatus | ConvertTo-Json -Compress }
