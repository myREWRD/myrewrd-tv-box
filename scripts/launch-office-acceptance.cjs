// Run only with verified synthetic Preview variables, never default Development.
// OIDC remains an environment input; no credential CLI argument or dotenv export.
const fs = require('node:fs');
const path = require('node:path');
const {spawn,execFileSync} = require('node:child_process');
const {validateMetadata, publicMetadata} = require('../src/acceptance-context');
if (process.platform !== 'win32' || !process.env.VERCEL_OIDC_TOKEN) throw Error('Office Windows and locally authenticated Vercel OIDC required');
if (process.env.SUPABASE_URL !== 'https://rwcpejpazuomogzvbwfy.supabase.co'
    || process.env.NEXT_PUBLIC_SUPABASE_URL !== process.env.SUPABASE_URL) throw Error('Synthetic Preview environment required');
const metadata = path.resolve(process.argv[2] || 'office-acceptance.json');
validateMetadata(publicMetadata(JSON.parse(fs.readFileSync(metadata,'utf8'))), require('../package.json').version);
const root = path.join(process.env.USERPROFILE,'myREWRD-TV-Box');
const executable = path.join(root,'runtime-a','myREWRD TV Box.exe');
const ps = path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
const running = execFileSync(ps,['-NoProfile','-Command',"$root=Join-Path $env:USERPROFILE 'myREWRD-TV-Box';@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($root+'\\',[StringComparison]::OrdinalIgnoreCase)}).Count"],{windowsHide:true,encoding:'utf8'}).trim();
if (running !== '0') throw Error('Close the KUEVY runtime before office access enrollment or refresh');
for(let cursor=executable;cursor!==path.dirname(cursor);cursor=path.dirname(cursor)) {
  if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw Error('Redirected office runtime denied');
}
// Do not pass database, provider or release credentials from Vercel's environment.
const env = {};
for(const key of Object.keys(process.env)) if (/^(SystemRoot|windir|SystemDrive|USERPROFILE|USERNAME|USERDOMAIN|COMPUTERNAME|APPDATA|LOCALAPPDATA|TEMP|TMP|PATH|PATHEXT|ProgramFiles|ProgramFiles\(x86\)|ProgramData|ALLUSERSPROFILE|HOMEDRIVE|HOMEPATH|VERCEL_OIDC_TOKEN)$/i.test(key)) env[key]=process.env[key];
const child = spawn(executable,['--kuevy-enroll-acceptance',metadata],{env,windowsHide:true,stdio:'ignore',detached:true});
child.once('error',()=>{console.error('Office runtime could not start');process.exitCode=1;});
child.once('spawn',()=>{child.unref();console.log('Office runtime started; verify the synthetic venue on the TV.');});
