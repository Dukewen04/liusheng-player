const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
let now=0;class Clock extends Date{static now(){return now;}}
const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,value:'',focus(){this.focused=true;},select(){this.selected=true;}});return nodes.get(id);};
let copied='';const c=vm.createContext({Date:Clock,console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,document:{getElementById:node,visibilityState:'visible',addEventListener(){}},navigator:{userAgent:'Chrome Test',clipboard:{async writeText(v){copied=v;}}},localStorage:{getItem(){return null;}},fetch:async()=>{now+=100;return {ok:true,status:200,text:async()=>'[]'};}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
 showToast=()=>{};
 globalThis.app={measureImportOperation,getImportDiagnostic,copyImportDiagnostic,updateImportDiagnostic,updateImportVisibility,readMusicJSON,
 begin:()=>{importController=new AbortController();return importDiagnostic={startedAt:Date.now(),stageAt:Date.now(),activeStages:[],stages:{},operations:{},counts:null,backgroundMs:0,hiddenAt:null};}};
})();`),c);
(async()=>{
 const a=c.app,report=a.begin();
 a.updateImportDiagnostic({total:1,checked:0,active:['等待搜索可播版本：私密歌名 — 私密歌手']});
 now=50;assert.equal(a.getImportDiagnostic().workerStageMs['等待搜索可播版本'],50);
 now=100;assert.equal(a.getImportDiagnostic().workerStageMs['等待搜索可播版本'],100,'Copying an in-progress diagnostic does not stop stage accounting');
 c.document.visibilityState='hidden';a.updateImportVisibility();now=300;c.document.visibilityState='visible';a.updateImportVisibility();assert.equal(a.getImportDiagnostic().backgroundMs,200);
 await a.readMusicJSON('https://oiapi.net/api/Kuwo?msg=私密歌名&token=secret');
 const track={source:'kuwo',title:'私密歌名'};
 const value=await a.measureImportOperation('audio',track,async()=>{now+=18000;return track;});assert.equal(value,track);
 const timeout=Object.assign(Error('播放超时'),{retryable:true});await assert.rejects(a.measureImportOperation('audio',track,async()=>{now+=18000;throw timeout;}),e=>e===timeout);
 const aborted=new DOMException('cancel','AbortError');await assert.rejects(a.measureImportOperation('api','https://api.qijieya.cn/meting/?id=secret',async()=>{now+=50;throw aborted;}),e=>e===aborted);
 const snapshot=a.getImportDiagnostic();assert.equal(snapshot.operations['audio:kuwo'].calls,2);assert.equal(snapshot.operations['audio:kuwo'].ok,1);assert.equal(snapshot.operations['audio:kuwo'].timeouts,1);assert.equal(snapshot.operations['audio:kuwo'].p95Ms,18000);assert.equal(snapshot.operations['api:netease'].canceled,1);assert.equal(snapshot.operations['api:kuwo'].averageMs,100);
 await a.readMusicJSON('https://oiapi.net/api/Kuwo?msg=私密歌名&token=secret');
 assert.equal(a.getImportDiagnostic().operations['network:kuwo'].calls,1);assert.equal(a.getImportDiagnostic().operations['cache:kuwo'].calls,1,'Cache hits are distinct from real network calls');
 c.fetch=async()=>{throw Error('network down');};
 await assert.rejects(a.readMusicJSON('https://example.com/api/kugou?msg=secret'));
 await assert.rejects(a.readMusicJSON('https://example.com/api/kugou?msg=another'));
 assert.equal(a.getImportDiagnostic().operations['network:kugou'].calls,1);assert.equal(a.getImportDiagnostic().operations['cooldown:kugou'].calls,1,'Cooldown skips do not inflate real network request counts');
 await a.copyImportDiagnostic();assert(copied);assert(!copied.includes('私密歌名')&&!copied.includes('私密歌手')&&!copied.includes('secret'));assert.equal(JSON.parse(copied).browser,'Chrome Test');
 c.navigator.clipboard.writeText=async()=>{throw Error('permission');};await a.copyImportDiagnostic();assert(!node('import-diagnostic-text').hidden&&node('import-diagnostic-text').selected);assert(node('import-diagnostic-text').value.includes('elapsedMs'));
 const old=report;const fresh=a.begin();await a.measureImportOperation('audio',{source:'qq'},async()=>{now+=10;});assert.equal(Object.keys(fresh.operations).length,1);assert.equal(old.operations['audio:kuwo'].calls,2);
 console.log('通过：浏览器诊断保持返回值和错误、汇总真实请求/试播/超时/取消、记录后台和排队时间、运行中复制不丢计时、无歌名或链接、剪贴板失败可手动复制、任务隔离。');
})().catch(e=>{console.error(e);process.exitCode=1;});
