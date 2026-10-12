const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(links=[]){
  let handler,observer,timeout,clicks=0;
  const sent=[],location=new URL('https://www.primevideo.com/');
  const context={process:{isMainFrame:true},crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},location,
    require:()=>({ipcRenderer:{on:(_name,fn)=>handler=fn,send:(name,value)=>sent.push({name,value})}}),
    document:{readyState:'complete',documentElement:{},querySelectorAll:()=>links},URL,
    MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}},
    setTimeout:fn=>{timeout=fn;return fn;},clearTimeout(){},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/private-signin-preload.js'),'utf8'),context);
  const link=(query='',visible=true,target='')=>({href:'https://www.primevideo.com/auth-redirect'+query,textContent:'Sign In',target,getClientRects:()=>visible?[{}]:[],click:()=>clicks++});
  const command=type=>handler({}, {id:'entry',documentId:sent[0].value.documentId,url:'https://www.primevideo.com/',command:{type}});
  return {link,command,sent,location,setLinks:value=>links=value,mutate:()=>observer(),expire:()=>timeout(),clicks:()=>clicks};
}
(async()=>{
  const f=fixture();f.setLinks([f.link('?context=one'),f.link('?context=two')]);await f.command('prime-entry');assert.equal(f.clicks(),1);assert.equal(f.sent.at(-1).value.applied,true);
  const responsive=fixture();responsive.setLinks([responsive.link('',false),responsive.link('?visible=true')]);await responsive.command('prime-entry');assert.equal(responsive.clicks(),1);
  for(const target of ['_blank','popup']){const f=fixture();f.setLinks([f.link('',true,target)]);const pending=f.command('prime-entry');f.expire();await pending;assert.equal(f.clicks(),0);assert.equal(f.sent.at(-1).value.applied,false);}
  for(const type of ['point','text','erase','tab','scroll']){const f=fixture();f.setLinks([f.link()]);await f.command(type);assert.equal(f.clicks(),0);assert.equal(f.sent.at(-1).value.applied,false);}
  const delayed=fixture();const pending=delayed.command('prime-entry');delayed.setLinks([delayed.link()]);delayed.mutate();await pending;assert.equal(delayed.clicks(),1);
  const missing=fixture();const absent=missing.command('prime-entry');missing.expire();await absent;assert.equal(missing.clicks(),0);assert.equal(missing.sent.at(-1).value.applied,false);
  const changed=fixture();const waiting=changed.command('prime-entry');changed.location.pathname='/changed';changed.setLinks([changed.link()]);changed.mutate();await waiting;assert.equal(changed.clicks(),0);assert.equal(changed.sent.at(-1).value.applied,false);
  const badText=fixture();const link=badText.link();link.textContent='Buy now';badText.setLinks([link]);const bad=badText.command('prime-entry');badText.expire();await bad;assert.equal(badText.clicks(),0);
  console.log('PASS Prime entry: contextual duplicates, visible same-window selection, popup denial, delayed/missing/changed markup and Home input rejection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
