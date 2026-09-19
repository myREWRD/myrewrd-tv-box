const {app,BrowserWindow,BrowserView}=require('electron');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
app.setPath('userData',fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'tv-layout-')));
app.whenReady().then(async()=>{
 const mainWindow=new BrowserWindow({show:false,width:1280,height:720,useContentSize:true,frame:false});
 const streamView=new BrowserView({webPreferences:{sandbox:true,contextIsolation:true}});mainWindow.addBrowserView(streamView);
 const source=fs.readFileSync(require.resolve('../src/main.js'),'utf8').replaceAll('\r\n','\n');
 const layoutSource=source.match(/function layoutGameDayView\(\) \{[\s\S]*?\n\}\n(?=function startGameDayMode)/)[0];
 const context=vm.createContext({mainWindow,streamView,Math});vm.runInContext(layoutSource,context);
 await mainWindow.loadFile(require('node:path').resolve('src/pages/gameday-sponsor.html'));
 for(const [width,height] of [[1280,720],[1920,1080],[800,600]]){
  mainWindow.setContentSize(width,height);context.layoutGameDayView();
  const windowBounds=mainWindow.getContentBounds(),viewBounds=streamView.getBounds();
  await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{if(innerWidth===${windowBounds.width} && innerHeight===${windowBounds.height}){clearInterval(timer);resolve(true)}else if(Date.now()-started>10000){clearInterval(timer);reject(Error('Renderer resize timeout'))}},50)})`);
  const stripTop=await mainWindow.webContents.executeJavaScript("document.querySelector('.gd-strip').getBoundingClientRect().top");
  assert.equal(viewBounds.width,windowBounds.width);assert.equal(viewBounds.x,0);assert.equal(viewBounds.y,0);
  assert.ok(Math.abs(viewBounds.height-stripTop)<1,`No gap at ${width}x${height}: provider bottom ${viewBounds.height}, sponsor top ${stripTop}`);
 }
 assert.match(source,/mainWindow\.on\("resize", layoutGameDayView\)/);
 assert.match(source,/mainWindow\.on\("enter-full-screen", layoutGameDayView\)/);
 console.log('PASS real Electron provider bounds touch sponsor strip at 720p,1080p and resize; no taskbar gap');
 mainWindow.destroy();app.exit(0);
}).catch(e=>{console.error(e);app.exit(1)});
