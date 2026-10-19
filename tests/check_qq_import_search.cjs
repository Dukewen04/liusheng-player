const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
function boot(){
 const c=vm.createContext({URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,console,document:{addEventListener(){}},localStorage:{getItem(){return null;}}});
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
  searchNetease=(k,p,n,pool)=>globalThis.search('netease',k,pool);searchQQ=(k,n,pool)=>globalThis.search('qq',k,pool);
  searchKuwo=(k,n,pool)=>globalThis.search('kuwo',k,pool);searchJoox=(k,n,pool)=>globalThis.search('joox',k,pool);searchKugou=(k,n,pool)=>globalThis.search('kugou',k,pool);
  ensureTrackDetails=async t=>{globalThis.details.push(t.source);if(t.source==='qq')throw Error('QQ details must not be requested');Object.assign(t,{audioUrl:'https://cdn.example/'+t.uid,detailsLoaded:true,quality:'lossless'});};
  probeRecording=async t=>{globalThis.probes.push(t.source);if(t.source==='qq')throw Error('QQ must not be probed');return {...t};};
  globalThis.app={verifyImportData};
 })();`),c);c.probes=[];c.details=[];return c;
}
const original={uid:'qq-import',source:'qq',songid:'original-mid',title:'姑娘',artist:'隔壁老樊',album:'Imported Album',audioUrl:'https://cdn.example/old-qq.mp3',detailsLoaded:true};
const payload=()=>({favorites:[original],playlists:[{id:'qq-list',name:'QQ',tracks:[original]}]});
(async()=>{
 for(const compareAll of [true,false])for(const near of [false,true]){
  const c=boot(),calls=[];c.search=async(name,k,pool)=>{
   calls.push(name);assert.notEqual(name,'qq','QQ imports do not search QQ in any phase');
   if(name==='kuwo'){
    const candidate={uid:'kuwo-replacement',source:'kuwo',title:near?'你的姑娘':original.title,artist:original.artist,album:'Source Album'};
    if(!pool.trackMap.has(candidate.uid)){pool.trackMap.set(candidate.uid,candidate);pool.searchResults.push(candidate);}
   }
  };
  const result=await c.app.verifyImportData(payload(),new AbortController(),()=>{},{compareAll});
  assert.equal(result.stats.total,1);assert.equal(result.stats.replaced,1);assert.equal(result.stats.deferred,0);
  const track=result.data.playlists[0].tracks[0];assert.equal(track.source,'kuwo');assert.equal(track.importCheck,'playable');
  assert.equal(track.title,original.title);assert.equal(track.artist,original.artist);assert.equal(track.album,original.album);assert.equal(track.importOriginalUid,original.uid);
  assert.equal(track.importMatchType,near?'same-artist-near-title':undefined);
  assert(calls.includes('netease')&&calls.includes('kuwo'));assert(c.details.length&&c.probes.length);assert(!c.details.includes('qq')&&!c.probes.includes('qq'));
  assert.equal(result.data.favorites[0].uid,track.uid);assert.equal(original.source,'qq');
 }
 const c=boot();c.search=async(name,k,pool)=>{assert.notEqual(name,'qq');pool.sourceErrors[name]='Temporary outage';};
 const deferred=await c.app.verifyImportData(payload(),new AbortController(),()=>{});
 assert.equal(deferred.stats.deferred,1);assert.equal(deferred.stats.failed,0);assert.equal(deferred.data.playlists[0].tracks[0].uid,original.uid);
 assert.equal(c.probes.length,0);assert.equal(c.details.length,0);
 console.log('通过：QQ 导入无论是否优选均跳过 QQ 原曲、搜索及详情，精确和相近匹配均验证其他音源，保留原元数据，临时故障保留歌曲。');
})().catch(e=>{console.error(e);process.exitCode=1;});
