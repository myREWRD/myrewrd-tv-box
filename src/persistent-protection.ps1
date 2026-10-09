param([ValidateSet('protect','unprotect')][string]$Mode,[ValidateSet('reset-recovery','office-context')][string]$Purpose)
$ErrorActionPreference='Stop'
$bytes=$null;$result=$null
try {
 Add-Type -AssemblyName System.Security
 $inputLine=[Console]::In.ReadLine()
 if(!$inputLine -or $inputLine.Length -gt 28000){throw 'Input denied'}
 $bytes=[Convert]::FromBase64String($inputLine)
 if(!$bytes.Length -or $bytes.Length -gt 20000){throw 'Input denied'}
 $entropy=[Text.Encoding]::UTF8.GetBytes('KUEVY-TV:persistent:v1:'+$Purpose)
 $scope=[Security.Cryptography.DataProtectionScope]::CurrentUser
 if($Mode -eq 'protect'){$result=[Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,$scope)}
 elseif($Mode -eq 'unprotect'){$result=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$entropy,$scope)}
 else{throw 'Mode denied'}
 [Console]::Out.WriteLine([Convert]::ToBase64String($result))
} catch {[Console]::Error.WriteLine('Windows persistent protection failed');exit 1}
finally {
 if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}
 if($result){[Array]::Clear($result,0,$result.Length)}
 $inputLine=$null
}
