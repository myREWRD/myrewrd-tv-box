const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {editSearch}=require('../src/provider-text-editing');
const resultPath=process.argv[2],record=r=>{if(resultPath)fs.writeFileSync(resultPath,JSON.stringify(r));};
app.setPath('userData',path.join(app.getPath('temp'),'myrewrd-search-edit-fixture-'+process.pid));app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}}),contents=w.webContents;
 for(const searchMarkup of ['<input type=search id=search value="NFL highlights">','<textarea id=search name=search_query role=combobox placeholder="Search or ask a question">NFL highlights</textarea>']){
 await contents.loadURL('data:text/html,'+encodeURIComponent('<form onsubmit="event.preventDefault();document.title=\'submitted\'">'+searchMarkup+'<button>Search</button></form><input type=text id=other>'));
 await contents.executeJavaScript('document.querySelector("#search").focus()');
 const apply=c=>editSearch({edit_id:'11111111-1111-4111-8111-111111111111',...c},{contents,current:()=>true,sessionId:'fixture'});
 assert.equal((await apply({type:'edit_start'})).editing.text,'NFL highlights');
 assert.equal(await apply({type:'edit_update',text:'',start:0,end:0}),true);assert.equal(await contents.executeJavaScript('document.querySelector("#search").value'),'');
 assert.equal(await apply({type:'edit_update',text:'NBA games',start:9,end:9}),true);
 assert.equal(await apply({type:'edit_update',text:'NBA game',start:8,end:8}),true);
 assert.equal(await contents.executeJavaScript('document.querySelector("#search").value'),'NBA game');
 assert.equal(await apply({type:'edit_submit'}),true);assert.equal(await contents.executeJavaScript('document.title'),'submitted');
 await contents.executeJavaScript('document.title="not submitted";document.querySelector("#other").focus()');
 assert.equal(await apply({type:'edit_update',text:'wrong',start:5,end:5}),false);assert.equal(await apply({type:'edit_submit'}),false);assert.equal(await contents.executeJavaScript('document.title'),'not submitted');
 }
 assert.equal(w.isVisible(),false);w.destroy();record({ok:true,checks:['input-and-textarea','existing-query','clear','replace','backspace','bound-submit','focus-change-denial']});app.exit(0);
}).catch(e=>{record({ok:false,error:e.message});app.exit(1);});
