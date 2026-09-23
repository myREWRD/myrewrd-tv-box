# Input only through stdin. No password in arguments, output, temporary XML or logs.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
try {
 if ($env:USERNAME -notin @('KUEVY','myrewrd') -or $env:USERDOMAIN -ne $env:COMPUTERNAME) { [Console]::Out.Write('unsupported'); exit }
 $raw = [Console]::In.ReadToEnd()
 if ($raw.Length -gt 4096) { throw 'invalid' }
 $value = $raw | ConvertFrom-Json
 $raw = $null
 $ssid = [string]$value.ssid
 $password = [string]$value.password
 if ([Text.Encoding]::UTF8.GetByteCount($ssid) -lt 1 -or [Text.Encoding]::UTF8.GetByteCount($ssid) -gt 32 -or $ssid -match '[\x00-\x1f\x7f]' -or ($password -notmatch '^[\x20-\x7e]{8,63}$' -and $password -notmatch '^[a-fA-F0-9]{64}$')) { throw 'invalid' }
 Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WifiSave {
 [DllImport("wlanapi.dll")] static extern uint WlanOpenHandle(uint v,IntPtr r,out uint n,out IntPtr h);
 [DllImport("wlanapi.dll")] static extern uint WlanCloseHandle(IntPtr h,IntPtr r);
 [DllImport("wlanapi.dll")] static extern uint WlanEnumInterfaces(IntPtr h,IntPtr r,out IntPtr list);
 [DllImport("wlanapi.dll")] static extern void WlanFreeMemory(IntPtr p);
 [DllImport("wlanapi.dll")] static extern uint WlanGetProfileList(IntPtr h,ref Guid g,IntPtr r,out IntPtr list);
 [DllImport("wlanapi.dll",CharSet=CharSet.Unicode)] static extern uint WlanGetProfile(IntPtr h,ref Guid g,string name,IntPtr r,out IntPtr xml,ref uint flags,out uint access);
 [DllImport("wlanapi.dll",CharSet=CharSet.Unicode)] static extern uint WlanSetProfile(IntPtr h,ref Guid g,uint flags,string xml,string security,bool overwrite,IntPtr r,out uint reason);
 [DllImport("wlanapi.dll",CharSet=CharSet.Unicode)] static extern uint WlanSetProfilePosition(IntPtr h,ref Guid g,string name,uint position,IntPtr r);
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct InterfaceInfo { public Guid id; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=256)] public string description; public uint state; }
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct ProfileInfo { [MarshalAs(UnmanagedType.ByValTStr,SizeConst=256)] public string name; public uint flags; }
 public static string Save(string name,string hex,string xml) {
  IntPtr h=IntPtr.Zero,list=IntPtr.Zero,profiles=IntPtr.Zero; uint negotiated;
  try {
   if(WlanOpenHandle(2,IntPtr.Zero,out negotiated,out h)!=0) return "no_adapter";
   if(WlanEnumInterfaces(h,IntPtr.Zero,out list)!=0) return "windows_error";
   int count=Marshal.ReadInt32(list); if(count==0)return "no_adapter"; if(count!=1)return "multiple_adapters";
   var adapter=(InterfaceInfo)Marshal.PtrToStructure(IntPtr.Add(list,8),typeof(InterfaceInfo));
   if(WlanGetProfileList(h,ref adapter.id,IntPtr.Zero,out profiles)!=0)return "windows_error";
   for(int i=0;i<Marshal.ReadInt32(profiles);i++) {
    var profile=(ProfileInfo)Marshal.PtrToStructure(IntPtr.Add(profiles,8+i*Marshal.SizeOf(typeof(ProfileInfo))),typeof(ProfileInfo));
    if(profile.name==name)return "existing_network";
    IntPtr old=IntPtr.Zero; uint flags=0,access;
    try {
     if(WlanGetProfile(h,ref adapter.id,profile.name,IntPtr.Zero,out old,ref flags,out access)!=0)return "windows_error";
     var doc=new System.Xml.XmlDocument(); doc.XmlResolver=null; doc.LoadXml(Marshal.PtrToStringUni(old));
     var ssid=doc.SelectSingleNode("//*[local-name()='SSID']/*[local-name()='hex']");
     var text=doc.SelectSingleNode("//*[local-name()='SSID']/*[local-name()='name']");
     if((ssid!=null&&String.Equals(ssid.InnerText,hex,StringComparison.OrdinalIgnoreCase))||(text!=null&&text.InnerText==name))return "existing_network";
    } finally { if(old!=IntPtr.Zero)WlanFreeMemory(old); }
   }
   uint reason;
   // Current kiosk user profile, automatic connection, no explicit connect and no overwrite.
   // Stage as manual, put below every existing network, then enable auto.
   // A newly added higher-priority profile must not trigger Windows auto-switch.
   if(WlanSetProfile(h,ref adapter.id,2,xml.Replace("<connectionMode>auto</connectionMode>","<connectionMode>manual</connectionMode>"),null,false,IntPtr.Zero,out reason)!=0)return "windows_error";
   if(WlanSetProfilePosition(h,ref adapter.id,name,(uint)Marshal.ReadInt32(profiles),IntPtr.Zero)!=0)return "windows_error";
   if(WlanSetProfile(h,ref adapter.id,2,xml,null,true,IntPtr.Zero,out reason)!=0)return "windows_error";
   IntPtr saved=IntPtr.Zero; uint savedFlags=0,savedAccess;
   try { if(WlanGetProfile(h,ref adapter.id,name,IntPtr.Zero,out saved,ref savedFlags,out savedAccess)!=0)return "windows_error"; }
   finally { if(saved!=IntPtr.Zero)WlanFreeMemory(saved); }
   return "saved";
  } catch { return "windows_error"; }
  finally { if(profiles!=IntPtr.Zero)WlanFreeMemory(profiles); if(list!=IntPtr.Zero)WlanFreeMemory(list); if(h!=IntPtr.Zero)WlanCloseHandle(h,IntPtr.Zero); }
 }
}
'@
 $escaped = [Security.SecurityElement]::Escape($ssid)
 $secret = [Security.SecurityElement]::Escape($password)
 $hex = [BitConverter]::ToString([Text.Encoding]::UTF8.GetBytes($ssid)).Replace('-','')
 $keyType = if ($password.Length -eq 64) { 'networkKey' } else { 'passPhrase' }
 $xml = '<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>'+$escaped+'</name><SSIDConfig><SSID><hex>'+$hex+'</hex><name>'+$escaped+'</name></SSID><nonBroadcast>false</nonBroadcast></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><autoSwitch>false</autoSwitch><MSM><security><authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>'+$keyType+'</keyType><protected>false</protected><keyMaterial>'+$secret+'</keyMaterial></sharedKey></security></MSM></WLANProfile>'
 $result = [WifiSave]::Save($ssid,$hex,$xml)
 [Console]::Out.Write($result)
} catch { [Console]::Out.Write('windows_error') }
finally { $value=$null; $password=$null; $secret=$null; $xml=$null }
