const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const original={uid:'imported',source:'qq',title:'Song',artist:'Singer'};
function boot(){
 const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,document:{addEventListener(){}},localStorage:{getItem(){return null;}}});
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
  searchNetease=(k,p,n,pool)=>globalThis.search('netease',k,pool);searchQQ=(k,n,pool)=>globalThis.search('qq',k,pool);
  searchKuwo=(k,n,pool)=>globalThis.search('kuwo',k,pool);searchJoox=(k,n,pool)=>globalThis.search('joox',k,pool);searchKugou=(k,n,pool)=>globalThis.search('kugou',k,pool);
  ensureTrackDetails=async track=>{globalThis.compat.push(track.preferCompatible);globalThis.loads++;Object.assign(track,{audioUrl:'https://cdn.example/'+track.uid+(track.preferCompatible?'-compatible':''),detailsLoaded:true});};
  probeRecording=async(track,options)=>globalThis.probe(track,options);
  globalThis.find=findBestImportRecording;
 })();`),c);c.loads=0;c.compat=[];return c;
}
const add=(pool,name,uid=name)=>{const t={...original,uid,source:name,quality:'128k'};if(!pool.trackMap.has(uid)){pool.trackMap.set(uid,t);pool.searchResults.push(t);}};
const run=(c,signal=new AbortController().signal)=>c.find(original,signal,()=>{},null,{compareAll:false,skipQQ:true});
const hang=signal=>new Promise((resolve,reject)=>{if(signal.aborted){reject(signal.reason);return;}signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
const within=async task=>{let timer;try{return await Promise.race([task,new Promise((resolve,reject)=>timer=setTimeout(()=>reject(Error('Fast imports waited on a slow source')),300))]);}finally{clearTimeout(timer);}};
(async()=>{
 const fast=boot(),queries=[];let stopped=0;
 fast.search=async(name,k,pool)=>{queries.push([name,k]);if(name==='kuwo'){add(pool,name);return;}try{await hang(pool.signal);}finally{stopped++;}};
 fast.probe=async track=>({...track});const winner=await within(run(fast));
 assert.equal(winner.source,'kuwo');assert(fast.compat[0],'Fast Kuwo imports prefer the compatible tier');assert(queries.every(([n,k])=>n!=='qq'&&k==='Song Singer'));assert.equal(queries.length,2,'A fast verified match avoids starting the two slower sources');await new Promise(r=>setImmediate(r));assert.equal(stopped,1,'Cancel the remaining fast search and clear the delayed slow-source launch');
 const probes=boot();let active=0,max=0,aborted=0;
 probes.search=async(name,k,pool)=>{if(name==='netease'){add(pool,name,'slow');add(pool,name,'fast');add(pool,name,'unused');}};
 probes.probe=async(track,{signal})=>{active++;max=Math.max(max,active);try{if(track.uid==='slow'){try{await hang(signal);}finally{aborted++;}}return {...track};}finally{active--;}};
 const selected=await within(run(probes));assert.equal(selected.uid,'fast');await new Promise(r=>setImmediate(r));assert.equal(max,2);assert.equal(active,0);assert.equal(aborted,1);assert.equal(probes.loads,2,'Do not start a queued third candidate after success');
 const fallback=boot(),rounds=[];fallback.search=async(name,k,pool)=>{rounds.push(k);if(k==='Song'&&name==='kuwo')add(pool,name);};fallback.probe=async track=>({...track});assert.equal((await run(fallback)).source,'kuwo');assert(rounds.includes('Song'),'Try title-only search after the combined query fails');
 const fallbackAudio=boot();fallbackAudio.search=async(name,k,pool)=>{if(name==='kuwo')add(pool,name);};fallbackAudio.probe=async track=>{if(track.preferCompatible)throw Error('Compatible audio unavailable');return {...track};};assert.equal((await run(fallbackAudio)).source,'kuwo');assert.deepEqual(fallbackAudio.compat,[true,false],'Only fall back to the original tier if compatible playback fails');
 const slowNeeded=boot();slowNeeded.search=async(name,k,pool)=>{if(name==='joox')add(pool,name);};slowNeeded.probe=async track=>({...track});assert.equal((await within(run(slowNeeded))).source,'joox','Slow sources start immediately when fast sources have no matching candidate');
 const hedged=boot();hedged.setTimeout=(fn,ms)=>setTimeout(fn,ms===1800?5:ms);let fastCanceled=0;
 hedged.search=async(name,k,pool)=>{if(['netease','kuwo'].includes(name)){try{await hang(pool.signal);}finally{fastCanceled++;}}else if(name==='joox')add(pool,name);};hedged.probe=async track=>({...track});assert.equal((await within(run(hedged))).source,'joox');await new Promise(r=>setImmediate(r));assert.equal(fastCanceled,2,'The delayed hedge can escape stalled fast sources');
 const stop=boot(),ctrl=new AbortController();stop.search=async(name,k,pool)=>hang(pool.signal);stop.probe=async track=>track;const task=run(stop,ctrl.signal);ctrl.abort();await assert.rejects(task,e=>e.name==='AbortError');
 const down=boot();down.search=async(name,k,pool)=>{pool.sourceErrors[name]='Temporarily unavailable';};down.probe=async()=>{throw Error('No audio');};await assert.rejects(run(down),e=>e.retryable);
 console.log('通过：首轮结果即验证、QQ导入按需启动慢源且不请求QQ、成功不补搜歌名并取消慢源、两路候选验证取消慢地址、仅失败后补搜、取消清理及故障保留。');
})().catch(e=>{console.error(e);process.exitCode=1;});
