const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const workflow=fs.readFileSync('.github/workflows/build-windows.yml','utf8');
const source=workflow.match(/node <<'NODE'\r?\n([\s\S]*?)\r?\n          NODE/)[1].replace(/^          /gm,'');
const version=require('../package.json').version;
const assets=['zip','setup.ps1'].map(ext=>({name:`myREWRD.TV.Box.${version}.${ext}`,digest:'sha256:'+'a'.repeat(64)}));
async function run({event='push',approved=version,present=[],ok=true}={}){
 const output=[];const process={env:{GITHUB_EVENT_NAME:event,GITHUB_REF:'refs/heads/main',APPROVED_VERSION:approved,GITHUB_OUTPUT:'output'},exitCode:0};
 await vm.runInNewContext(source,{require:name=>name==='node:fs'?{appendFileSync:(_p,text)=>output.push(text)}:{version},process,console:{log(){},error(){}},fetch:async()=>({ok,json:async()=>({assets:present})})});
 return{output:output.join(''),exitCode:process.exitCode};
}
(async()=>{
 assert.equal((await run({event:'pull_request',approved:''})).output,'build=true\n');
 assert.equal((await run()).output,'build=true\n');
 assert.equal((await run({present:assets})).output,'build=false\n');
 for(const options of [{approved:''},{present:[assets[0]]},{present:[assets[1]]},{present:assets.map(a=>({...a,digest:null}))},{ok:false}]){const r=await run(options);assert.equal(r.exitCode,1);assert.equal(r.output,'');}
 assert.match(workflow,/overwrite_files: false/);
 console.log('PASS release acceptance gate, PR build, fresh publish, immutable reuse, partial assets, missing digests and network failures.');
})().catch(e=>{console.error(e);process.exitCode=1;});
