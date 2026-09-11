using System;
using System.Text;
using System.Runtime.InteropServices;
using System.ComponentModel;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
public sealed class TvUpdateProcess : IDisposable {
  [StructLayout(LayoutKind.Sequential)] struct Basic { public long a,b; public uint flags; public UIntPtr min,max; public uint count; public UIntPtr affinity; public uint priority,schedule; }
  [StructLayout(LayoutKind.Sequential)] struct Io { public ulong a,b,c,d,e,f; }
  [StructLayout(LayoutKind.Sequential)] struct Limits { public Basic basic; public Io io; public UIntPtr a,b,c,d; }
  [StructLayout(LayoutKind.Sequential)] struct Accounting { public long a,b,c,d; public uint faults,total,active,terminated; }
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup { public int cb; public string reserved,desktop,title; public int x,y,xs,ys,xc,yc,fill,flags; public short show,reserved2; public IntPtr bytes,input,output,error; }
  [StructLayout(LayoutKind.Sequential)] struct Info { public IntPtr process,thread; public uint pid,tid; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr OpenJobObject(uint access,bool inherit,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int type,ref Limits info,int size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int type,ref Accounting info,int size,IntPtr length);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string exe,StringBuilder cmd,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref Startup startup,out Info info);
  [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr job,uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  IntPtr job,process;
  static void Check(bool ok) { if(!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  TvUpdateProcess(IntPtr handle) { job=handle; }
  public static TvUpdateProcess Open(string name) { IntPtr handle=OpenJobObject(14,false,name);if(handle==IntPtr.Zero) throw new Win32Exception();return new TvUpdateProcess(handle); }
  public TvUpdateProcess(string name) {
    job=CreateJobObject(IntPtr.Zero,name);if(job==IntPtr.Zero) throw new Win32Exception();
    try { Limits limits=new Limits();limits.basic.flags=0x2000;Check(SetInformationJobObject(job,9,ref limits,Marshal.SizeOf(typeof(Limits)))); }
    catch { Dispose();throw; }
  }
  public void Start(string exe,string argument,string cwd) {
    if(exe.Contains("\"") || argument.Contains("\"")) throw new ArgumentException();
    Info pi=new Info();
    try {
      Startup si=new Startup(); si.cb=Marshal.SizeOf(typeof(Startup)); si.flags=1; si.show=0;
      Check(CreateProcess(exe,new StringBuilder("\""+exe+"\" \""+argument+"\""),IntPtr.Zero,IntPtr.Zero,false,0x08000004,IntPtr.Zero,cwd,ref si,out pi));
      process=pi.process;
      Check(AssignProcessToJobObject(job,process));
      if(ResumeThread(pi.thread)==0xffffffff) throw new Win32Exception();
    } catch { if(pi.process!=IntPtr.Zero) TerminateProcess(pi.process,1); Dispose(); throw; }
    finally { if(pi.thread!=IntPtr.Zero) CloseHandle(pi.thread); }
  }
  public uint Active { get { Accounting info=new Accounting(); Check(QueryInformationJobObject(job,1,ref info,Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero)); return info.active; } }
  public void Stop() { if(job!=IntPtr.Zero) TerminateJobObject(job,1); }
  public void Release() { Limits limits=new Limits(); Check(SetInformationJobObject(job,9,ref limits,Marshal.SizeOf(typeof(Limits)))); Dispose(); }
  public void Dispose() { if(process!=IntPtr.Zero) { CloseHandle(process); process=IntPtr.Zero; } if(job!=IntPtr.Zero) { CloseHandle(job); job=IntPtr.Zero; } }
}

static class Supervisor {
  static JavaScriptSerializer json = new JavaScriptSerializer();
  static string directory,nonce,version,phase="initializing";
  static Dictionary<string,object> manifest;
  static string Value(string key) { return (string)manifest[key]; }
  static void Mark(string name,string state) {
    File.WriteAllText(Path.Combine(directory,name),json.Serialize(new {nonce=nonce,version=version,phase=state,pid=Process.GetCurrentProcess().Id}));
  }
  static void TryMark(string name,string state) { try { Mark(name,state); } catch {} }
  static bool HasMark(string name,string state) {
    try { var v=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(directory,name))); return (string)v["nonce"]==nonce && (string)v["version"]==version && (string)v["phase"]==state; } catch { return false; }
  }
  static bool EqualPath(string a,string b) { return String.Equals(Path.GetFullPath(a),Path.GetFullPath(b),StringComparison.OrdinalIgnoreCase); }
  static string Fingerprint(byte[] bytes) { return bytes==null?"absent":Convert.ToBase64String(bytes); }
  static string Hash(string file) { using(var stream=File.OpenRead(file)) using(var hash=SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-","").ToLowerInvariant(); }
  static void SetStartup(string file,byte[] bytes) {
    string temp=file+"."+nonce+".tmp"; File.WriteAllBytes(temp,bytes);
    if(File.Exists(file)) File.Replace(temp,file,null); else File.Move(temp,file);
  }
  static void WaitMark(TvUpdateProcess process,string name,string state,int milliseconds) {
    DateTime deadline=DateTime.UtcNow.AddMilliseconds(milliseconds);
    while(!HasMark(name,state)) {
      if(process.Active==0 || HasMark("abort.json","abort") || DateTime.UtcNow>deadline) throw new Exception("Candidate failed");
      Thread.Sleep(100);
    }
  }
  static int Watch(string root,string pidText,string startedText) {
    TvUpdateProcess owned=null;
    try {
      var supervisor=Process.GetProcessById(Int32.Parse(pidText));
      if(!EqualPath(supervisor.MainModule.FileName,System.Reflection.Assembly.GetExecutingAssembly().Location)
        || new DateTimeOffset(supervisor.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()!=Int64.Parse(startedText)) return 1;
      IntPtr handle=supervisor.Handle;
      owned=TvUpdateProcess.Open("Local\\myrewrd-update-"+nonce);
      Mark("watcher.ready.json","watcher-ready");
      if(!supervisor.WaitForExit(180000)) { supervisor.Kill();supervisor.WaitForExit(15000); }
      if(!supervisor.HasExited) return 1;
      if(HasMark("complete.json","complete")) { owned.Release();owned=null;return 0; }
      owned.Stop();DateTime deadline=DateTime.UtcNow.AddSeconds(15);
      while(owned.Active>0 && DateTime.UtcNow<deadline) Thread.Sleep(100);
      if(owned.Active>0) { TryMark("watcher.result.json","candidate-stop-failed");return 1; }
      owned.Dispose();owned=null;
      // The normal recovery path may already have restarted the old app.
      if(HasMark("result.json","rollback-started") || HasMark("result.json","rollback-started-startup-unrestored")
        || HasMark("result.json","parent-retained")) return 0;
      try {
        var old=Process.GetProcessById(Convert.ToInt32(manifest["parentPid"]));
        if(!old.HasExited && EqualPath(old.MainModule.FileName,Value("parentExe"))
          && Math.Abs(new DateTimeOffset(old.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()-Convert.ToDouble(manifest["parentStartedAt"]))<5000) return 0;
      } catch {}
      TryMark("abort.json","abort");
      if(Hash(Value("previousExe"))!=Value("previousSha256")) return 1;
      // Restore only the Startup entry owned by this interrupted transaction.
      string startup=Value("startupPath");
      byte[] installed=Encoding.UTF8.GetBytes("@echo off\r\nstart \"\" \""+Value("candidateExe")+"\"\r\n");
      try {
        if(File.Exists(startup) && Fingerprint(File.ReadAllBytes(startup))==Fingerprint(installed)) {
          string backup=Path.Combine(directory,"startup.before");
          if(File.Exists(backup)) SetStartup(startup,File.ReadAllBytes(backup));
          else if(File.Exists(Path.Combine(directory,"startup.was-absent"))) File.Delete(startup);
        }
      } catch {}
      var restart=new ProcessStartInfo(Value("previousExe"));restart.WorkingDirectory=root;restart.UseShellExecute=false;restart.CreateNoWindow=true;restart.WindowStyle=ProcessWindowStyle.Hidden;
      Process.Start(restart);TryMark("result.json","watchdog-rollback-started");
      return 0;
    } catch { TryMark("watcher.result.json","watchdog-failed");return 1; }
    finally { if(owned!=null) owned.Dispose(); }
  }
  static int Main(string[] args) {
    bool watching=args.Length==4 && args[0]=="--watch";
    if(args.Length!=1 && !watching) return 1;
    string file=Path.GetFullPath(args[watching?1:0]); directory=Path.GetDirectoryName(file);nonce=Path.GetFileName(directory);
    if(!Regex.IsMatch(nonce,"^[a-f0-9]{32}$") || Path.GetFileName(file)!="manifest.json") return 1;
    string root=Directory.GetParent(Directory.GetParent(directory).FullName).FullName;
    string startup=null; byte[] previousBytes=null,newBytes=null;
    bool oldExited=false,startupWritten=false,completed=false;
    TvUpdateProcess candidate=null;
    try {
      manifest=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file));version=Value("version");
      if(Value("nonce")!=nonce || !Regex.IsMatch(version,"^\\d+\\.\\d+\\.\\d+$")) throw new Exception();
      foreach(string exe in new[]{Value("previousExe"),Value("candidateExe")}) {
        bool installed=manifest.ContainsKey("installed") && Convert.ToBoolean(manifest["installed"]);
        bool validLocation=installed
          ? (EqualPath(exe,Path.Combine(root,"runtime-a","myREWRD TV Box.exe")) || EqualPath(exe,Path.Combine(root,"runtime-b","myREWRD TV Box.exe")))
          : EqualPath(Path.GetDirectoryName(exe),root);
        if(!validLocation || !String.Equals(Path.GetExtension(exe),".exe",StringComparison.OrdinalIgnoreCase) || !File.Exists(exe)) throw new Exception();
        if(installed && EqualPath(Value("previousExe"),Value("candidateExe"))) throw new Exception();
      }
      if(watching) return Watch(root,args[2],args[3]);
      phase="verifying-artifacts";
      if(Hash(Value("candidateExe"))!=Value("sha256") || Hash(Value("previousExe"))!=Value("previousSha256")) throw new Exception();
      startup=Path.Combine(Environment.GetEnvironmentVariable("APPDATA"),"Microsoft","Windows","Start Menu","Programs","Startup","myREWRD-TV-Box.bat");
      if(!EqualPath(startup,Value("startupPath"))) throw new Exception();
      previousBytes=File.Exists(startup)?File.ReadAllBytes(startup):null;
      if(previousBytes==null) File.WriteAllText(Path.Combine(directory,"startup.was-absent"),"");
      else File.WriteAllBytes(Path.Combine(directory,"startup.before"),previousBytes);
      newBytes=Encoding.UTF8.GetBytes("@echo off\r\nstart \"\" \""+Value("candidateExe")+"\"\r\n");
      string probe=startup+"."+nonce+".probe";File.WriteAllText(probe,"probe");File.Delete(probe);
      phase="validating-parent";
      var old=Process.GetProcessById(Convert.ToInt32(manifest["parentPid"]));
      if(!EqualPath(old.MainModule.FileName,Value("parentExe"))) throw new Exception();
      double start=new DateTimeOffset(old.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds();
      if(Math.Abs(start-Convert.ToDouble(manifest["parentStartedAt"]))>5000) throw new Exception();
      IntPtr oldHandle=old.Handle;
      candidate=new TvUpdateProcess("Local\\myrewrd-update-"+nonce);
      var self=Process.GetCurrentProcess();
      var monitor=new ProcessStartInfo(self.MainModule.FileName,"--watch \""+file+"\" "+self.Id+" "+new DateTimeOffset(self.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds());
      monitor.UseShellExecute=false;monitor.CreateNoWindow=true;monitor.WindowStyle=ProcessWindowStyle.Hidden;monitor.WorkingDirectory=root;
      Process.Start(monitor);
      DateTime watcherDeadline=DateTime.UtcNow.AddSeconds(15);
      while(!HasMark("watcher.ready.json","watcher-ready")) { if(DateTime.UtcNow>watcherDeadline) throw new Exception();Thread.Sleep(100); }
      Mark("supervisor.ready.json","supervisor-ready");
      phase="waiting-for-parent";
      if(!old.WaitForExit(30000)) throw new Exception();oldExited=true;
      if(HasMark("abort.json","abort")) throw new Exception();
      phase="launching-candidate";
      candidate.Start(Value("candidateExe"),"--tv-update-job="+file,root);
      phase="waiting-for-board";WaitMark(candidate,"candidate.ready.json","board-ready",90000);
      phase="committing-startup";
      byte[] current=File.Exists(startup)?File.ReadAllBytes(startup):null;
      if(Fingerprint(current)!=Fingerprint(previousBytes)) throw new Exception();
      SetStartup(startup,newBytes);startupWritten=true;
      Mark("commit.json","commit");
      phase="waiting-for-activation";WaitMark(candidate,"candidate.active.json","active",15000);
      for(int i=0;i<30;i++) { if(candidate.Active==0) throw new Exception();Thread.Sleep(100); }
      Mark("complete.json","complete");
      candidate.Release();candidate=null;completed=true;
      try { Mark("result.json","complete"); } catch {}
      return 0;
    } catch {
      if(completed) return 0;
      // Recovery must not depend on writable diagnostics or Startup storage.
      TryMark("abort.json","abort");
      try {
        if(candidate!=null) {
          candidate.Stop();DateTime deadline=DateTime.UtcNow.AddSeconds(15);
          while(candidate.Active>0 && DateTime.UtcNow<deadline) Thread.Sleep(100);
          if(candidate.Active>0) { TryMark("result.json","candidate-stop-failed");return 1; }
          candidate.Dispose();candidate=null;
        }
      } catch { TryMark("result.json","candidate-stop-failed");return 1; }
      bool startupRestored=true;
      try {
        if(startupWritten && File.Exists(startup) && Fingerprint(File.ReadAllBytes(startup))==Fingerprint(newBytes)) {
          if(previousBytes==null) File.Delete(startup);else SetStartup(startup,previousBytes);
        }
      } catch { startupRestored=false; }
      try { File.WriteAllText(Path.Combine(root,"update-failure.json"),json.Serialize(new {version=version,phase=phase})); } catch {}
      try {
        if(oldExited) {
          var restore=new ProcessStartInfo(Value("previousExe"));restore.WorkingDirectory=root;restore.UseShellExecute=false;restore.CreateNoWindow=true;restore.WindowStyle=ProcessWindowStyle.Hidden;
          Process.Start(restore);TryMark("result.json",startupRestored?"rollback-started":"rollback-started-startup-unrestored");
        } else TryMark("result.json","parent-retained");
      } catch { TryMark("result.json","rollback-launch-failed"); }
      return 1;
    } finally { if(candidate!=null) candidate.Dispose(); }
  }
}
