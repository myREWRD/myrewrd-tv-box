// Windows-only process fixture. Never loads a venue, credentials, or a browser.
using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Collections.Generic;
using System.Web.Script.Serialization;
class UpdateFixture {
  static JavaScriptSerializer json = new JavaScriptSerializer();
  static void Main(string[] args) {
    string root=Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
    if(args.Length>0 && args[0]=="--original") {
      var self=Process.GetCurrentProcess();
      File.WriteAllText(Path.Combine(root,"original.json"),json.Serialize(new {pid=self.Id,startedAt=new DateTimeOffset(self.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()}));
      while(!File.Exists(Path.Combine(root,"shutdown"))) Thread.Sleep(50);
      return;
    }
    if(args.Length==0) { File.WriteAllText(Path.Combine(root,"rollback.marker"),"restarted"); return; }
    string manifestPath=args[0].Substring("--tv-update-job=".Length);
    string job=Path.GetDirectoryName(manifestPath);
    var manifest=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(manifestPath));
    string nonce=(string)manifest["nonce"],version=(string)manifest["version"];
    string mode=File.ReadAllText(Path.Combine(root,"fixture-mode.txt"));
    File.WriteAllText(Path.Combine(job,"candidate.started"),"started");
    if(mode=="exit") return;
    if(mode=="no-ready") { Thread.Sleep(150000); return; }
    File.WriteAllText(Path.Combine(job,"candidate.ready.json"),json.Serialize(new {nonce=nonce,version=version,phase="board-ready"}));
    while(!File.Exists(Path.Combine(job,"commit.json"))) Thread.Sleep(50);
    if(mode=="no-active") { Thread.Sleep(150000); return; }
    File.WriteAllText(Path.Combine(job,"candidate.active.json"),json.Serialize(new {nonce=nonce,version=version,phase="active"}));
    while(!File.Exists(Path.Combine(job,"complete.json"))) Thread.Sleep(50);
    File.WriteAllText(Path.Combine(root,"success.marker"),"activated");
    Thread.Sleep(1000);
  }
}
