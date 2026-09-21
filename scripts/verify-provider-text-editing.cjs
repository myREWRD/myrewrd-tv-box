const assert=require('node:assert/strict'),vm=require('node:vm');
const {editSearch}=require('../src/provider-text-editing');
let allowed=true,url='https://www.youtube.com/',frame={},after=()=>{};
class Input{
 constructor(){this.type='search';this.buffer='NFL highlights';this.selectionStart=0;this.selectionEnd=14;this.maxLength=256;this.autocomplete='';this.isConnected=true;this.name='search_query';}
 get value(){return this.buffer;}set value(v){this.buffer=v;}
 getClientRects(){return [{}];}getAttribute(){return null;}matches(selector){return selector.startsWith('input[type=search]')&&['text','search'].includes(this.type);}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}dispatchEvent(){}
}
let submissions=0;class Form{requestSubmit(){submissions++;}}
const field=new Input(),document={activeElement:field,querySelectorAll:()=>[]},location={href:url};
const context=vm.createContext({document,location,HTMLInputElement:Input,HTMLFormElement:Form,WeakRef,InputEvent:class{},Event:class{}});
const contents={get mainFrame(){return frame;},getURL:()=>url,isLoading:()=>false,executeJavaScriptInIsolatedWorld:async(_,[{code}])=>{const result=vm.runInContext(code,context);after();return result;}};
const id='11111111-1111-4111-8111-111111111111';
const apply=(command,sessionId='session')=>editSearch({edit_id:id,...command},{contents,current:()=>allowed,sessionId});
(async()=>{
 field.form=new Form();let r=await apply({type:'edit_start'});assert.equal(r.editing.text,'NFL highlights');
 assert.equal(await apply({type:'edit_update',text:'',start:0,end:0}),true);assert.equal(field.value,'');
 assert.equal(await apply({type:'edit_update',text:'NBA',start:3,end:3}),true);assert.equal(field.value,'NBA');
 assert.equal(await apply({type:'edit_update',text:'N',start:1,end:1}),true);assert.equal(field.value,'N');
 assert.equal(await apply({type:'edit_update',text:'wrong session',start:0,end:0},'other'),false);
 assert.equal(await apply({type:'edit_submit'}),true);assert.equal(submissions,1);document.activeElement=new Input();assert.equal(await apply({type:'edit_submit'}),false);assert.equal(submissions,1);assert.equal(await apply({type:'edit_update',text:'wrong field',start:0,end:0}),false);assert.equal(field.value,'N');document.activeElement=field;
 assert.equal(await apply({type:'edit_end'}),true);assert.equal(await apply({type:'edit_update',text:'after close',start:0,end:0}),false);
 field.type='password';assert.equal(await apply({type:'edit_start'}),false);field.type='text';field.name='username';assert.equal(await apply({type:'edit_start'}),false);
 field.name='search_query';field.autocomplete='one-time-code';assert.equal(await apply({type:'edit_start'}),false);field.autocomplete='';
 document.querySelectorAll=()=>[{matches:()=>true,getClientRects:()=>[{}]}];assert.equal(await apply({type:'edit_start'}),false);document.querySelectorAll=()=>[];
 allowed=false;assert.equal(await apply({type:'edit_start'}),false);allowed=true;
 after=()=>{frame={};};assert.equal(await apply({type:'edit_start'}),false,'navigation invalidates returned search text');after=()=>{};
 field.buffer='x'.repeat(257);assert.equal(await apply({type:'edit_start'}),false);field.buffer='safe';field.selectionEnd=4;
 for(const command of [{type:'edit_update',text:'x'.repeat(257),start:0,end:0},{type:'edit_update',text:'\n',start:0,end:0},{type:'edit_update',text:'ok',start:-1,end:1}])assert.equal(await apply(command),false);
 console.log('PASS live search editing: existing query, clear, replace/backspace, exact field/session binding, sensitive/non-search refusal, revoked/navigation and length/selection bounds.');
})().catch(e=>{console.error(e);process.exitCode=1;});
