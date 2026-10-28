const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',style:{}});return nodes.get(id);};
class ProbeAudio{constructor(){throw Error('Search must not create an audio probe');}}
const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,Audio:ProbeAudio,setImmediate,setTimeout,clearTimeout,
  location:{hostname:'127.0.0.1',port:'8766'},document:{getElementById:node,addEventListener(){}},localStorage:{getItem(){return null;}}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
  renderMiniSearchList=()=>{};renderPlaylistList=()=>{};rebuildLibraryTrackMap=()=>{};showToast=()=>{};
  dom.searchStatus=document.getElementById('status');dom.searchCount=document.getElementById('count');dom.playerStatus=document.getElementById('player');
  globalThis.app={state,dom,searchAllSources,searchAllNetease,clearSearchResults,ensureTrackDetails,
    details:fn=>ensureTrackDetails=fn,provider:fn=>searchNetease=fn};
})();`),c);
const a=c.app,signal=()=>new AbortController().signal;
(async()=>{
  a.details(async()=>{throw Error('Search must not fetch audio details');});
  a.state.currentTrack={uid:'currently-playing'};a.state.enabledSources={netease:true};a.state.searchKeyword='query';
  const valid={uid:'good',source:'netease'},bad={uid:'bad',source:'netease'};let checks=0;
  a.provider(async(kw,page,limit,pool)=>{assert.equal(page,1);assert.equal(limit,50);pool.searchResults.push(valid,bad,valid);});
  a.details(async()=>{checks++;throw Error('Unexpected audio request');});
  await a.searchAllSources(true);
  assert.equal(a.state.searchResults.length,2);assert.equal(a.state.searchResults[0].uid,'good');assert(a.state.trackMap.has('bad'),'Unplayable candidates are no longer filtered during search');
  await a.searchAllSources();assert.equal(checks,0,'Search performs no audio details or playability checks');assert.equal(a.state.searchResults.length,2);
  let oldRelease;
  a.provider(async(kw,page,limit,pool)=>{if(kw==='old')await new Promise(resolve=>oldRelease=resolve);pool.searchResults.push({uid:kw,source:'netease'});});
  a.state.searchKeyword='old';const old=a.searchAllSources(true);
  a.state.searchKeyword='new';await a.searchAllSources(true);oldRelease();await old;
  assert.equal(a.state.searchResults.length,1);assert.equal(a.state.searchResults[0].uid,'new');assert(!a.state.searchInProgress);
  // Clearing aborts the active request and rejects results that arrive later.
  a.state.searchKeyword='old';const clearing=a.searchAllSources();a.clearSearchResults();oldRelease();await clearing;
  assert.equal(a.state.searchResults.length,0);assert.equal(a.dom.searchCount.textContent,'');assert(a.dom.searchCount.hidden);assert(!a.state.searchInProgress);assert.equal(a.state.currentTrack.uid,'currently-playing');
  // Keep all provider results, including more than the previous five-track cap.
  a.provider(async(kw,page,limit,pool)=>{assert.equal(limit,50);pool.searchResults.push(...Array.from({length:12},(_,i)=>({uid:'limit-'+i,source:'netease'})));});
  a.state.searchKeyword='limit';await a.searchAllSources();assert.equal(a.state.searchResults.length,12);assert(!a.dom.searchCount.hidden);
  const requests=[];a.provider(async(kw,page,limit,pool)=>{requests.push(limit);for(let i=0;i<Math.min(limit,142);i++){const uid='all-'+i;if(!pool.trackMap.has(uid)){const track={uid,source:'netease'};pool.trackMap.set(uid,track);pool.searchResults.push(track);}}});
  const full={searchResults:[],trackMap:new Map(),signal:signal()};await a.searchAllNetease('all',full);assert.deepEqual(requests,[50,100,200]);assert.equal(full.searchResults.length,142);
  a.provider(async(kw,page,limit,pool)=>pool.searchResults.push({uid:'repeat',source:'netease'}));const repeated={searchResults:[],trackMap:new Map(),signal:signal()};await a.searchAllNetease('repeat',repeated);assert.equal(repeated.searchResults.length,1,'A capped provider does not cause endless requests');
  assert(!html.includes('id="limit-select"'));assert(!html.includes('id="load-more-btn"'));assert(!source.includes("dom.searchMiniList.addEventListener('scroll'"));assert(!source.includes("dom.playlistMain.addEventListener('scroll'"));
  a.state.currentTrack=null;a.state.searchKeyword='no-autoplay';await a.searchAllSources();assert.equal(checks,0);assert.equal(a.state.currentTrack,null,'Searching without a current song does not start audio');
  console.log('通过：搜索零取源/零试播、保留全部候选并去重、不限制条数、继续读取及重复结果终止、新搜索与清空取消旧请求、当前播放不受影响、无歌曲时不自动播放。');
})().catch(error=>{console.error(error);process.exitCode=1;});
