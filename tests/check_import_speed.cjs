const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const original={uid:'original',source:'qq',title:'Example',artist:'Singer'};
function boot(){
 const c=vm.createContext({URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,console,document:{addEventListener(){}},localStorage:{getItem(){return null;}}});
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
  searchNetease=(k,p,n,pool)=>globalThis.search('netease',k,pool);searchQQ=(k,n,pool)=>globalThis.search('qq',k,pool);
  searchKuwo=async()=>{};searchJoox=async()=>{};searchKugou=async()=>{};
  ensureTrackDetails=async t=>{if(t.detailsLoaded)return;globalThis.loads[t.uid]=(globalThis.loads[t.uid]||0)+1;if(t.uid==='original')throw Error('unavailable');Object.assign(t,{audioUrl:'https://cdn.example/'+t.uid,detailsLoaded:true});};
  probeRecording=async t=>{globalThis.probes.push(t.uid);return {...t};};
  globalThis.app={findBestImportRecording,readMusicJSON,begin:()=>importController=new AbortController(),expire:()=>importRequestCache.clear(),resetHealth:()=>musicServiceCooldowns.clear()};
 })();`),c);c.loads={};c.probes=[];return c;
}
function add(pool,source,quality){const t={...original,source,uid:source+'-'+quality,quality};if(!pool.trackMap.has(t.uid)){pool.trackMap.set(t.uid,t);pool.searchResults.push(t);}}
(async()=>{
 let cancelled=false,searches=0;
 const fast=boot();fast.search=async(source,k,pool)=>{
  searches++;if(source==='netease'){add(pool,source,'lossless');return;}
  await new Promise((resolve,reject)=>pool.signal.addEventListener('abort',()=>{cancelled=true;reject(pool.signal.reason);},{once:true}));
 };
 let timer;
 try{
  const winner=await Promise.race([fast.app.findBestImportRecording(original,new AbortController().signal,()=>{}),new Promise((resolve,reject)=>timer=setTimeout(()=>reject(Error('Waited for an unresponsive source')),250))]);
  assert.equal(winner.source,'netease');assert(cancelled,'A playable highest tier cancels unfinished provider searches');
 }finally{clearTimeout(timer);}
 const count=searches;
 await fast.app.findBestImportRecording(original,new AbortController().signal,()=>{},{...original,quality:'lossless',audioUrl:'https://cdn.example/verified'});
 assert.equal(searches,count,'Already-verified NetEase/QQ lossless does not trigger more searches');
 const tiers=boot();tiers.search=async(source,k,pool)=>{
  if(source==='qq')await new Promise(resolve=>setTimeout(resolve,15));
  add(pool,source,source==='qq'?'lossless':'320k');
 };
 const best=await tiers.app.findBestImportRecording(original,new AbortController().signal,()=>{});
 assert.equal(best.quality,'lossless','A lower tier cannot end the comparison before a later higher tier');
 assert.equal(tiers.loads['netease-320k'],1,'Candidate metadata is reused across source completions');
 const failedURL=boot();failedURL.search=async(source,k,pool)=>add(pool,source,source==='netease'?'lossless':'320k');
 const fallback=await failedURL.app.findBestImportRecording(original,new AbortController().signal,()=>{},null,{failedAudioUrl:'https://cdn.example/netease-lossless'});
 assert.equal(fallback.source,'qq');assert(!failedURL.probes.includes('netease-lossless'),'The original failed audio URL is not retried during later candidate stages');
 const cached=boot();cached.app.begin();let requests=0;
 cached.fetch=async()=>{requests++;return {ok:true,status:200,text:async()=>'["original"]'};};
 const url='https://api.example/search?q=test';
 const first=await cached.app.readMusicJSON(url);first.push('mutated');
 assert.equal((await cached.app.readMusicJSON(url)).length,1);assert.equal(requests,1,'Repeated import queries reuse a fresh response without leaking mutations');
 const stop=new AbortController();stop.abort();await assert.rejects(cached.app.readMusicJSON(url,stop.signal),e=>e.name==='AbortError');
 cached.app.expire();await cached.app.readMusicJSON(url);assert.equal(requests,2);
 const outage=boot();outage.app.begin();requests=0;
 outage.fetch=async()=>{requests++;throw Error('network down');};
 await assert.rejects(outage.app.readMusicJSON(url),e=>e.retryable);assert.equal(requests,1,'Bulk import avoids repeating a failed request immediately');
 await assert.rejects(outage.app.readMusicJSON(url+'2'),e=>e.retryable);assert.equal(requests,1,'A failing service is skipped briefly for later tracks');
 outage.app.resetHealth();outage.fetch=async()=>{requests++;return {ok:true,status:200,text:async()=>'[]'};};
 await outage.app.readMusicJSON(url);assert.equal(requests,2,'Failed responses are never cached as valid results');
 console.log('通过：慢源未结束即验证并取消、已验证无损不重复搜索、保留更高音质比较、候选详情复用、导入查询缓存与取消、故障音源短暂跳过、错误不缓存。');
})().catch(e=>{console.error(e);process.exitCode=1;});
