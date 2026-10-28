const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const audios=[],nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',style:{}});return nodes.get(id);};
class ProbeAudio{
  constructor(){audios.push(this);this.duration=180;}
  load(){if(!this.src)return;setImmediate(()=>{
    if(!this.src)return;
    if(this.src.includes('hang'))return;
    if(this.src.includes('broken')||this.src.includes('flac')){this.error={code:4};this.onerror?.();}
    else{if(this.src.includes('infinite'))this.duration=Infinity;this.oncanplay?.();}
  });}
  pause(){this.paused=true;}
  removeAttribute(){this.src='';}
  play(){throw new Error('Search must never start playback');}
}
const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,Audio:ProbeAudio,setImmediate,setTimeout,clearTimeout,
  location:{hostname:'127.0.0.1',port:'8766'},document:{getElementById:node,addEventListener(){}},localStorage:{getItem(){return null;}}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
  renderMiniSearchList=()=>{};renderPlaylistList=()=>{};rebuildLibraryTrackMap=()=>{};showToast=()=>{};
  dom.searchStatus=document.getElementById('status');dom.searchCount=document.getElementById('count');dom.playerStatus=document.getElementById('player');
  globalThis.app={state,dom,probeSearchAudio,checkSearchTrack,filterPlayableSearchTracks,searchAllSources,searchAllNetease,clearSearchResults,ensureTrackDetails,
    details:fn=>ensureTrackDetails=fn,checker:fn=>checkSearchTrack=fn,provider:fn=>searchNetease=fn};
})();`),c);
const a=c.app,signal=()=>new AbortController().signal;
(async()=>{
  await a.probeSearchAudio({audioUrl:'https://cdn.example/good.mp3'},signal());
  await assert.rejects(a.probeSearchAudio({audioUrl:'https://cdn.example/broken.json'},signal()),error=>error.mediaCode===4);
  await assert.rejects(a.probeSearchAudio({audioUrl:'https://cdn.example/infinite'},signal()));
  const abort=new AbortController(),pending=a.probeSearchAudio({audioUrl:'https://cdn.example/hang'},abort.signal);
  abort.abort();await assert.rejects(pending,error=>error.name==='AbortError');
  c.setTimeout=(callback,ms)=>setTimeout(callback,ms===8000?2:ms);
  await assert.rejects(a.probeSearchAudio({audioUrl:'https://cdn.example/hang'},signal()));c.setTimeout=setTimeout;
  assert(audios.every(audio=>audio.muted&&audio.paused&&!audio.src),'Every probe must be muted and released');
  a.dom.playerStatus.textContent='正在播放';
  await a.ensureTrackDetails({source:'netease',songid:'123'},{silent:true,signal:signal()});
  assert.equal(a.dom.playerStatus.textContent,'正在播放','Background checks preserve the current player status');
  let details=0;
  a.details(async(track,options)=>{assert(options.silent);assert(options.signal);details++;track.audioUrl=track.preferCompatible?'https://cdn.example/good.mp3':'https://cdn.example/flac';});
  const compatible={source:'qq'};await a.checkSearchTrack(compatible,signal());assert(compatible.preferCompatible);assert.equal(details,2);
  let active=0,maximum=0;
  a.checker(async track=>{active++;maximum=Math.max(maximum,active);await new Promise(setImmediate);active--;if(track.bad)throw Error('unavailable');});
  const checked=[];
  await a.filterPlayableSearchTracks(Array.from({length:11},(_,i)=>({uid:String(i),bad:i%3===0})),signal(),(track,ok)=>checked.push({track,ok}));
  assert.equal(maximum,4);assert.equal(checked.length,11);assert.equal(checked.filter(r=>r.ok).length,7);
  const stop=new AbortController();let release,callbacks=0;
  a.checker(()=>new Promise(resolve=>{release=resolve;}));
  const stopped=a.filterPlayableSearchTracks([{}],stop.signal,()=>callbacks++);stop.abort();release();await stopped;assert.equal(callbacks,0);

  a.state.currentTrack={uid:'currently-playing'};a.state.enabledSources={netease:true};a.state.searchKeyword='query';
  const valid={uid:'good',source:'netease'},bad={uid:'bad',source:'netease'};let checks=0;
  a.provider(async(kw,page,limit,pool)=>{assert.equal(page,1);assert.equal(limit,50);pool.searchResults.push(valid,bad);});
  a.checker(async track=>{checks++;if(track.uid==='bad')throw Error('not audio');});
  await a.searchAllSources(true);
  assert.equal(a.state.searchResults.length,1);assert.equal(a.state.searchResults[0].uid,'good');assert(!a.state.trackMap.has('bad'));assert.equal(a.state.searchHiddenCount,1);
  await a.searchAllSources();assert.equal(checks,4,'Each explicit new search refreshes results without appending');assert.equal(a.state.searchResults.length,1);
  let oldRelease;
  a.provider(async(kw,page,limit,pool)=>{if(kw==='old')await new Promise(resolve=>oldRelease=resolve);pool.searchResults.push({uid:kw,source:'netease'});});
  a.checker(async()=>{});
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
  console.log('通过：静音音频加载检查、错误/非音频/无效时长排除、取消后释放资源、兼容音质重试、4路并发、仅显示可播放结果、不限制展示条数、网易云继续读取到结束、新搜索不累加、清空取消旧请求与隐藏空计数、搜索竞态隔离、不覆盖当前播放状态。');
})().catch(error=>{console.error(error);process.exitCode=1;});
