# Run locally on the dedicated TV appliance as administrator. No credentials required.
# Does not install software, change passwords, or change pairing configuration.
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
if ($env:USERNAME -ne 'myrewrd') {
    throw 'Run only from the dedicated local myrewrd TV appliance account.'
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if ($identity -ne ($env:COMPUTERNAME + '\myrewrd')) {
    throw 'A dedicated local account is required; domain accounts are not supported.'
}
foreach ($source in @('AC', 'DC')) {
    foreach ($setting in @(
        @('SUB_BUTTONS', 'PBUTTONACTION'),
        @('SUB_BUTTONS', 'SBUTTONACTION'),
        @('SUB_NONE', 'CONSOLELOCK')
    )) {
        & powercfg ("/set${source}valueindex") SCHEME_CURRENT $setting[0] $setting[1] 0
        if ($LASTEXITCODE -ne 0) { throw 'Windows could not apply unattended wake settings.' }
    }
}
& powercfg /setactive SCHEME_CURRENT
if ($LASTEXITCODE -ne 0) { throw 'Windows could not activate unattended wake settings.' }
Write-Host 'Wake settings applied. Test a short power-button press, deliberate sleep/wake, and restart before delivery.'
