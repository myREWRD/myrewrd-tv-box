using System;
using System.IO;
using System.Text;
using System.Globalization;
using System.Diagnostics;
using System.Runtime.InteropServices;

// Windows-only bridge: PowerShell needs a console, while the appliance is a
// GUI process. Create a hidden, separate console without a shell or credentials.
internal static class MaintenanceLauncher {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Startup {
    public int cb; public string reserved,desktop,title;
    public int x,y,xs,ys,xc,yc,fill,flags; public short show,reserved2;
    public IntPtr bytes,input,output,error;
  }
  [StructLayout(LayoutKind.Sequential)] struct Info { public IntPtr process,thread; public uint pid,tid; }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool CreateProcess(string application,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out Info info);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static string Plain(string value,string home) {
    string full=Path.GetFullPath(value);
    if(!full.StartsWith(home+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)) throw new ArgumentException();
    for(string cursor=full;!String.IsNullOrEmpty(cursor);cursor=Path.GetDirectoryName(cursor)) {
      if((File.Exists(cursor)||Directory.Exists(cursor))&&(File.GetAttributes(cursor)&FileAttributes.ReparsePoint)!=0) throw new ArgumentException();
    }
    return full;
  }
  static string Quote(string value) {
    if(value.IndexOfAny(new char[]{'"','\r','\n','\0'})>=0||value.EndsWith("\\")) throw new ArgumentException();
    return "\""+value+"\"";
  }
  static int Main(string[] args) {
    try {
      if(args.Length!=5) return 1;
      string home=Path.GetFullPath(Environment.GetEnvironmentVariable("USERPROFILE"));
      string root=Path.Combine(home,"myREWRD-TV-Box");
      string mode=args[0],script,parameters;
      int pid;
      string exe=Plain(args[3],home);
      if(!File.Exists(exe)||(!exe.Equals(Path.Combine(root,"runtime-a","myREWRD TV Box.exe"),StringComparison.OrdinalIgnoreCase)&&!exe.Equals(Path.Combine(root,"runtime-b","myREWRD TV Box.exe"),StringComparison.OrdinalIgnoreCase))) return 1;
      if(mode=="reset") {
        string journal=Plain(args[1],home);
        if(!journal.Equals(Path.Combine(home,".kuevy-reset","state.json"),StringComparison.OrdinalIgnoreCase)||!File.Exists(journal)||!Int32.TryParse(args[2],out pid)||pid<=0||!System.Text.RegularExpressions.Regex.IsMatch(args[4],"\\A[a-f0-9]{64}\\z")) return 1;
        script=Plain(Path.Combine(home,".kuevy-reset","cleanup.ps1"),home);
        parameters=" -Journal "+Quote(journal)+" -ParentPid "+pid+" -Executable "+Quote(exe)+" -ReadyNonce "+args[4];
      } else if(mode=="watchdog") {
        double started;
        if(!Int32.TryParse(args[1],out pid)||pid<=0||!Double.TryParse(args[2],NumberStyles.Float,CultureInfo.InvariantCulture,out started)||Double.IsInfinity(started)||Double.IsNaN(started)||started<=0) return 1;
        string health=Plain(args[4],home);
        if(!health.Equals(Path.Combine(root,".health",pid+".json"),StringComparison.OrdinalIgnoreCase)) return 1;
        string helper=Plain(Process.GetCurrentProcess().MainModule.FileName,home);
        string folder=Path.GetDirectoryName(helper);
        bool owned=false;
        foreach(string slot in new string[]{"runtime-a","runtime-b"}) if(folder.Equals(Path.Combine(root,slot,"resources","app.asar.unpacked","src"),StringComparison.OrdinalIgnoreCase)) owned=true;
        if(!owned) return 1;
        script=Plain(Path.Combine(folder,"runtime-watchdog.ps1"),home);
        parameters=" -ParentPid "+pid+" -StartedAt "+Quote(args[2])+" -Executable "+Quote(exe)+" -HealthFile "+Quote(health);
      } else return 1;
      if(!File.Exists(script)) return 1;
      string powershell=Path.Combine(Environment.SystemDirectory,"WindowsPowerShell","v1.0","powershell.exe");
      Startup si=new Startup();si.cb=Marshal.SizeOf(typeof(Startup));si.flags=1;si.show=0;
      Info info;
      // CREATE_NEW_CONSOLE | CREATE_NEW_PROCESS_GROUP. Never inherit the GUI
      // parent's pipes. The caller detaches this bridge from Node's exit job.
      bool created=CreateProcess(powershell,new StringBuilder(Quote(powershell)+" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "+Quote(script)+parameters),IntPtr.Zero,IntPtr.Zero,false,0x210,IntPtr.Zero,home,ref si,out info);
      if(!created) return 1;
      CloseHandle(info.thread);CloseHandle(info.process);return 0;
    } catch { return 1; }
  }
}
