const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const source=[...fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
function boot(fetch){
 const c=vm.createContext({fetch,console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,document:{addEventListener(){}},localStorage:{getItem(){return null;}}});
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,`globalThis.app={readMusicJSON,begin:()=>importController=new AbortController(),status:()=>({active:apicxActive,queued:apicxWaiters.length})};})();`),c);c.app.begin();return c;
}
const ok=()=>({ok:true,status:200,text:async()=>'[]'}),tick=()=>new Promise(setImmediate);
(async()=>{
 let active=0,max=0,calls=0;const fetched=[];
 const mixed=boot(async url=>{
  if(new URL(url).hostname!=='apicx.asia')return ok();
  calls++;fetched.push(url);active++;max=Math.max(max,active);
  return {ok:true,status:200,text:async()=>{await new Promise(r=>setTimeout(r,15));active--;return '[]';}};
 });
 const cancel=new AbortController();
 const urls=Array.from({length:12},(_,i)=>'https://apicx.asia/api/'+(i%2?'joox_music?msg=':'kugou.music?name=')+i);
 const jobs=urls.map((url,i)=>mixed.app.readMusicJSON(url,i===11?cancel.signal:undefined).then(()=>true,e=>e));
 await tick();assert.equal(calls,4,'JOOX and Kugou share four in-flight requests, not four each');
 await mixed.app.readMusicJSON('https://api.qijieya.cn/meting/?id=separate');assert.equal(calls,4,'Other music services are not held by the shared-host queue');
 cancel.abort();const results=await Promise.all(jobs);assert.equal(results[11].name,'AbortError');assert(!fetched.includes(urls[11]),'Canceled queued requests never reach the server');assert.equal(max,4);assert.equal(active,0);
 assert.equal(mixed.app.status().active,0);assert.equal(mixed.app.status().queued,0);
 await mixed.app.readMusicJSON(urls[0]);assert.equal(calls,11,'Cached responses bypass the service queue and network');

 const releases=[];let outageCalls=0;
 const outage=boot(()=>{outageCalls++;return new Promise(resolve=>releases.push(resolve));});
 const outageURL='https://apicx.asia/api/joox_music?msg=';
 const pending=Array.from({length:10},(_,i)=>outage.app.readMusicJSON(outageURL+i).then(()=>true,e=>e));
 await tick();assert.equal(outageCalls,4);
 releases[0]({ok:false,status:429});assert((await pending[0]).retryable);
 for(const release of releases.slice(1))release(ok());
 const failed=await Promise.all(pending);assert(failed.slice(4).every(e=>e.retryable));assert.equal(outageCalls,4,'Queued requests recheck cooldown instead of sending another burst');
 await assert.rejects(outage.app.readMusicJSON(outageURL+'after'),e=>e.retryable);assert.equal(outageCalls,4,'Older successes cannot erase the cooldown raised by a concurrent failure');
 assert.equal(outage.app.status().active,0);assert.equal(outage.app.status().queued,0);

 let briefCalls=0;const brief=boot(async()=>{briefCalls++;if(briefCalls===1)throw TypeError('Connection reset');return ok();});
 const briefResults=await Promise.all(Array.from({length:8},(_,i)=>brief.app.readMusicJSON(outageURL+i).then(()=>true,e=>e)));
 assert.equal(briefResults.filter(r=>r===true).length,7);assert.equal(briefCalls,8,'One transient connection failure does not disable healthy queued queries');
 let consecutiveCalls=0;const consecutive=boot(async()=>{consecutiveCalls++;return {ok:false,status:503,text:async()=>'{"code":500,"message":"Database unavailable"}'};});
 await assert.rejects(consecutive.app.readMusicJSON(outageURL+'one'),e=>e.retryable);await assert.rejects(consecutive.app.readMusicJSON(outageURL+'two'),e=>e.retryable);await assert.rejects(consecutive.app.readMusicJSON(outageURL+'three'),e=>e.retryable);
 assert.equal(consecutiveCalls,2,'Two consecutive real failures cool down the service');

 const stop=new AbortController(),stopped=boot((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));
 const stopping=Array.from({length:8},(_,i)=>stopped.app.readMusicJSON(outageURL+i,stop.signal).catch(e=>e));
 await tick();stop.abort();assert((await Promise.all(stopping)).every(e=>e.name==='AbortError'));assert.equal(stopped.app.status().active,0);assert.equal(stopped.app.status().queued,0);
 stopped.fetch=async()=>ok();await stopped.app.readMusicJSON(outageURL+'fresh');assert.equal(stopped.app.status().active,0,'Aborted imports do not leak permits into the next import');
 console.log('通过：JOOX/酷狗共享4路请求、其他音源独立、缓存绕过排队、排队取消不发请求、出队重新检查冷却、并发旧成功不清除新故障、取消释放全部名额。');
})().catch(e=>{console.error(e);process.exitCode=1;});
