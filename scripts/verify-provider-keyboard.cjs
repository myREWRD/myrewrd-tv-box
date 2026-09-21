const assert=require('node:assert/strict'),vm=require('node:vm');
const {applyKeyboard}=require('../src/provider-keyboard');
let allowed=true,url='https://www.youtube.com/',frame={},after=()=>{},before=()=>{};
class Input {
 constructor(type='text'){this.type=type;this.buffer='';this.selectionStart=0;this.selectionEnd=0;this.maxLength=256;this.autocomplete='';}
 get value(){return this.buffer;}set value(value){this.buffer=value;}
 getClientRects(){return [{}];}matches(){return ['text','search'].includes(this.type);}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}dispatchEvent(){}
}
const document={activeElement:new Input()},location={href:url};
const contents={get mainFrame(){return frame;},getURL:()=>url,isLoading:()=>false,
 executeJavaScriptInIsolatedWorld:async(_world,[{code}])=>{before();const value=vm.runInNewContext(code,{document,location,HTMLInputElement:Input,HTMLTextAreaElement:class{},InputEvent:class{},Event:class{}});after();return value;},
 insertText(){throw Error('Native focused input must not be used');},sendInputEvent(){throw Error('Native focused input must not be used');}};
const apply=command=>applyKeyboard(command,{contents,current:()=>allowed});
(async()=>{
 const search=document.activeElement,password=new Input('password');
 assert.equal(await apply({type:'text',text:'Sports ball'}),'applied');assert.equal(search.value,'Sports ball');
 for(const text of ['', 'x'.repeat(257),'hello\nworld','\u0000'])assert.equal(await apply({type:'text',text}),'unavailable');
 document.activeElement=password;assert.equal(await apply({type:'text',text:'blocked'}),'unavailable');document.activeElement=search;
 allowed=false;assert.equal(await apply({type:'erase'}),'unavailable');allowed=true;
 after=()=>{document.activeElement=password;};assert.equal(await apply({type:'text',text:'!'}),'applied');assert.equal(password.value,'');assert.equal(search.value,'Sports ball!');
 after=()=>{};document.activeElement=search;assert.equal(await apply({type:'erase'}),'applied');assert.equal(search.value,'Sports ball');
 before=()=>{location.href='https://accounts.google.com/';};assert.equal(await apply({type:'text',text:'stale'}),'unavailable');assert.equal(search.value,'Sports ball');
 console.log('PASS ephemeral keyboard: atomic captured-field input, focus-switch credential protection, bounded text, revoked session and navigation denial.');
})().catch(error=>{console.error(error);process.exitCode=1;});
