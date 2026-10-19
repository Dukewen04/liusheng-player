const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const nodes=new Map(),storage=new Map();
function node(id){if(!nodes.has(id))nodes.set(id,{showModal(){this.open=true;},close(){this.open=false;},value:'',textContent:'',disabled:false,style:{},children:[],appendChild(child){this.children.push(child);},removeAttribute(key){delete this[key];},setAttribute(key,value){this[key]=value;}});return nodes.get(id);}
const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,setImmediate,
  document:{getElementById:node,createElement:()=>({}),addEventListener(){},querySelectorAll:()=>[]},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
 renderPlaylistList=()=>{};renderPlaylistOptions=()=>{};updateMainFavButton=()=>{};
 globalThis.app={state,dom,verifyImportData,findImportReplacement,importQualityRank,probeRecording,runVerifiedImport,importPlaylistData,serializeTrack,
   probe:fn=>probeRecording=fn,details:fn=>ensureTrackDetails=fn,
   qqSearch:fn=>searchQQ=fn,searches:fn=>{searchNetease=fn;searchQQ=async()=>{};searchKuwo=async()=>{};searchJoox=async()=>{};searchKugou=async()=>{};}};
})();`),c);
const a=c.app;
const original=(uid,source='qq')=>({uid,source,songid:uid,title:'Song',artist:'Singer'});
const payload=tracks=>({version:1,favorites:[],playlists:[{id:'example-list',name:'Example',tracks}]});
(async()=>{
 // The shared audio probe must advance both at the beginning and in the middle.
 const audioInstances=[];
 c.Audio=class{
   constructor(){audioInstances.push(this);this.duration=180;this.currentTime=0;this.seeking=false;}
   play(){setImmediate(()=>{if(!this.src)return;if(this.src.includes('hang'))return;this.onloadedmetadata?.();this.currentTime=1.1;this.ontimeupdate?.();assert.equal(this.currentTime,90);this.currentTime=90.8;this.ontimeupdate?.();});return Promise.resolve();}
   pause(){this.paused=true;}removeAttribute(){this.src='';}load(){}
 };
 a.details(async track=>{track.audioUrl='https://cdn.example/good';});
 await a.probeRecording(original('good'),{signal:new AbortController().signal,silent:true});
 assert(audioInstances[0].muted&&audioInstances[0].playsInline&&audioInstances[0].paused&&!audioInstances[0].src);
 const stopAudio=new AbortController();
 const stoppedAudio=a.probeRecording({...original('hang'),audioUrl:'https://cdn.example/hang'},{signal:stopAudio.signal,silent:true,useLoaded:true});
 stopAudio.abort();await assert.rejects(stoppedAudio,error=>error.name==='AbortError');assert(audioInstances.at(-1).paused);

 const candidates=[{...original('wrong-version'),title:'Song (Live)',tier:'lossless'},
   {...original('wrong-singer'),artist:'Other Singer',tier:'lossless'},
   {...original('qq-choice'),tier:'qq'}, {...original('kuwo-choice','kuwo'),tier:'lossless'},
   {...original('joox-choice','joox'),tier:'320'}];
 a.searches(async(keyword,page,limit,pool)=>{for(const track of candidates)if(!pool.trackMap.has(track.uid)){pool.trackMap.set(track.uid,track);pool.searchResults.push({...track});}});
 const loaded=[],attempted=[];let compatibleLoads=0;
 a.details(async track=>{
   loaded.push(track.uid);if(track.preferCompatible)compatibleLoads++;assert(track.preferHighestQuality);
   if(track.tier==='qq')Object.assign(track,{audioUrl:'https://cdn.example/broken-flac',quality:'lossless',qualityLabel:'LOSSLESS',audioOptions:[
     {audioUrl:'https://cdn.example/broken-flac',quality:'lossless',qualityLabel:'LOSSLESS',preferredAudioQuality:'sq'},
     {audioUrl:'https://cdn.example/qq-hq',quality:'normal',qualityLabel:'HQ',preferredAudioQuality:'hq'}]});
   else Object.assign(track,{audioUrl:'https://cdn.example/'+track.uid+(track.preferCompatible?'-low':''),quality:track.preferCompatible?'normal':track.tier==='lossless'?'lossless':'320k',qualityLabel:track.preferCompatible?'STD':track.tier==='lossless'?'LOSSLESS':'320K'});
 });
 a.probe(async(track,{signal,silent})=>{assert(signal);assert(silent);attempted.push(track.audioUrl||track.uid);if(track.uid.startsWith('original')||track.audioUrl?.includes('broken'))throw Error('Unavailable');return {...track};});
 const progress=[],data=payload([original('original-qq'),original('good-netease','netease')]);data.favorites=[data.playlists[0].tracks[0]];
 const checked=await a.verifyImportData(data,new AbortController(),stats=>progress.push(stats));
 assert.equal(checked.stats.total,2,'A song in both favorites and a playlist is checked once');assert.equal(checked.stats.replaced,1);assert.equal(checked.stats.passed,1);assert.equal(checked.stats.pending,0);
 assert.equal(checked.data.playlists[0].tracks[0].uid,'kuwo-choice');assert.equal(checked.data.playlists[0].tracks[0].importOriginalUid,'original-qq');assert.equal(checked.data.playlists[0].tracks[0].qualityLabel,'LOSSLESS');
 assert(attempted.indexOf('https://cdn.example/broken-flac')<attempted.indexOf('https://cdn.example/kuwo-choice'));
 assert.equal(compatibleLoads,0,'Do not wait for lower-tier addresses when lossless is playable');
 assert(!attempted.includes('https://cdn.example/qq-hq'),'Never pick a lower quality before trying another available lossless source');
 assert(!loaded.includes('wrong-version')&&!loaded.includes('wrong-singer'));assert.equal(a.state.searchResults.length,0,'Repair searches must not overwrite the user search');
 assert.equal(data.playlists[0].tracks[0].uid,'original-qq','Verification must not mutate input data');
 assert.equal(progress.at(-1).checked,2);assert(progress.some(item=>item.active.some(text=>text.includes('比较候选音质'))));

 // If lossless candidates fail, the best remaining playable tier wins.
 attempted.length=0;
 a.probe(async track=>{attempted.push(track.audioUrl);if(track.quality==='lossless')throw Error('decode');return {...track};});
 const fallback=await a.findImportReplacement(original('original'),new AbortController().signal,()=>{});
 assert.equal(a.importQualityRank(fallback),320);assert(!fallback.audioUrl.endsWith('-low'));
 assert.equal(a.serializeTrack(fallback).preferHighestQuality,true);assert(!a.serializeTrack(fallback).audioOptions,'Do not store signed playback URLs');

 // A hanging lossless URL must not block another playable URL of the same tier.
 const racing=[{...original('slow'),tier:'lossless'},{...original('fast'),tier:'lossless'},{...original('lower'),tier:'320k'}];
 a.searches(async(keyword,page,limit,pool)=>{for(const track of racing)if(!pool.trackMap.has(track.uid)){pool.trackMap.set(track.uid,track);pool.searchResults.push({...track});}});
 a.details(async track=>Object.assign(track,{audioUrl:'https://cdn.example/'+track.uid,quality:track.tier}));
 let hangingAborted=false;const raced=[];
 a.probe(async(track,{signal})=>{raced.push(track.uid);if(track.uid==='slow')return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{hangingAborted=true;reject(signal.reason);},{once:true}));return {...track};});
 const best=await a.findImportReplacement(original('original'),new AbortController().signal,()=>{});
 assert.equal(best.uid,'fast');assert(hangingAborted,'Cancel the slower probe once a same-quality candidate passes');assert.deepEqual(raced,['slow','fast']);

 // A slow source must not delay the next search round of a fast source.
 const fastQueries=[],slowQueries=[];let finishSlow;
 const slowSearch=new Promise(resolve=>finishSlow=resolve);
 a.searches(async(keyword,page,limit,pool)=>{fastQueries.push(keyword);if(!pool.trackMap.has('found')){const track={...original('found'),tier:'lossless'};pool.trackMap.set(track.uid,track);pool.searchResults.push(track);}});
 a.qqSearch(async keyword=>{slowQueries.push(keyword);if(slowQueries.length===1)await slowSearch;});
 const pipelined=a.findImportReplacement(original('original'),new AbortController().signal,()=>{});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(fastQueries.length,2);assert.equal(slowQueries.length,1);
 finishSlow();assert.equal((await pipelined).uid,'found');assert.equal(slowQueries.length,2);
 a.searches(async(keyword,page,limit,pool)=>{for(const track of racing)if(!pool.trackMap.has(track.uid)){pool.trackMap.set(track.uid,track);pool.searchResults.push({...track});}});

 // Do not drop to 320K while any lossless probe is still pending.
 const failLossless=[];const stages=[];
 a.probe(async track=>{stages.push(track.uid);if(track.quality==='lossless')return new Promise((resolve,reject)=>failLossless.push(()=>reject(Error('unavailable'))));return {...track};});
 const ordered=a.findImportReplacement(original('original'),new AbortController().signal,()=>{});
 while(failLossless.length<2)await new Promise(resolve=>setImmediate(resolve));
 assert(!stages.includes('lower'));failLossless.forEach(fail=>fail());assert.equal((await ordered).uid,'lower');

 const stopReplacement=new AbortController();let pendingProbes=0;
 a.probe(async(track,{signal})=>new Promise((resolve,reject)=>{pendingProbes++;signal.addEventListener('abort',()=>{pendingProbes--;reject(signal.reason);},{once:true});}));
 const stopping=a.findImportReplacement(original('original'),stopReplacement.signal,()=>{});
 while(pendingProbes<2)await new Promise(resolve=>setImmediate(resolve));
 stopReplacement.abort();await assert.rejects(stopping,error=>error.name==='AbortError');assert.equal(pendingProbes,0);
 a.probe(async()=>{const error=new Error('Blocked');error.name='NotAllowedError';throw error;});
 await assert.rejects(a.findImportReplacement(original('original'),new AbortController().signal,()=>{}),error=>error.name==='NotAllowedError');

 a.searches(async(keyword,page,limit,pool)=>{if(!pool.trackMap.has('low-only')){const t={...original('low-only','kuwo')};pool.trackMap.set(t.uid,t);pool.searchResults.push(t);}});
 a.details(async track=>{if(!track.preferCompatible)throw Error('Lossless endpoint unavailable');Object.assign(track,{audioUrl:'https://cdn.example/low-only',quality:'normal',qualityLabel:'STD'});});
 a.probe(async track=>({...track}));
 const lowOnly=await a.findImportReplacement(original('original'),new AbortController().signal,()=>{});
 assert(lowOnly.preferCompatible);assert(a.serializeTrack(lowOnly).preferCompatible,'Persist a tested compatible tier instead of refreshing back to broken lossless');

 a.searches(async()=>{});a.probe(async()=>{throw Error('Unavailable');});
 const failed=await a.verifyImportData(payload([original('original-qq'),original('original-netease','netease')]),new AbortController(),()=>{});
 assert.equal(failed.stats.failed,2);assert.equal(failed.failures.length,2);assert.equal(failed.data.playlists[0].tracks[0].importCheck,'unavailable');
 const canceled=new AbortController();let active=0,maxActive=0;
 a.probe(async(track,{signal})=>{active++;maxActive=Math.max(maxActive,active);await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{active--;reject(signal.reason);},{once:true}));});
 const pending=a.verifyImportData(payload(Array.from({length:8},(_,i)=>original('original-'+i))),canceled,()=>{});
 canceled.abort();const partial=await pending;assert.equal(maxActive,6);assert.equal(partial.stats.pending,8);assert(partial.data.playlists[0].tracks.every(track=>track.importCheck==='pending'));assert.equal(active,0);

 // Re-import repairs the old entry in place and keeps unrelated tracks and favorites.
 const old=original('original-qq'),unrelated={...original('unrelated'),title:'Other'};
 a.state.favorites=[unrelated];a.state.playlists=[{id:'example-list',name:'Example',tracks:[old,unrelated]}];a.state.trackMap=new Map([[old.uid,old],[unrelated.uid,unrelated]]);
 a.importPlaylistData(checked.data);
 assert.equal(a.state.playlists[0].tracks.length,3);assert.equal(a.state.playlists[0].tracks[0].uid,'kuwo-choice');assert(a.state.playlists[0].tracks.includes(unrelated));
 a.importPlaylistData(checked.data);assert.equal(a.state.playlists[0].tracks.length,3,'Re-import never appends another replacement');
 const upgraded={...checked.data.playlists[0].tracks[0],uid:'higher-quality',songid:'higher-quality'};
 a.importPlaylistData(payload([upgraded]));assert.equal(a.state.playlists[0].tracks[0].uid,'higher-quality');assert.equal(a.state.playlists[0].tracks.length,3);
 assert.equal(JSON.parse(storage.get('liusheng-library-v1')).playlists[0].tracks[0].importCheck,'playable');

 a.probe(async track=>({...track}));a.dom.playlistSelect=node('select');
 const observed=[];let countText='';Object.defineProperty(node('import-check-count'),'textContent',{get(){return countText;},set(value){countText=value;observed.push(value);},configurable:true});
 assert(await a.runVerifiedImport(async()=>payload([original('progress-1'),original('progress-2')]),node('status')));
 assert(observed.includes('共 2 首 · 已完成 0 首 · 剩余 2 首'));assert.equal(countText,'共 2 首 · 已完成 2 首 · 剩余 0 首');
 assert.equal(node('import-check-progress').max,2);assert.equal(node('import-check-progress').value,2);

 a.probe(async()=>{const error=new Error('Autoplay blocked');error.name='NotAllowedError';throw error;});
 const before=JSON.stringify(a.state.playlists);
 assert.equal(await a.runVerifiedImport(async()=>payload([original('blocked')]),node('status')),false);
 assert.equal(JSON.stringify(a.state.playlists),before);assert(node('status').textContent.includes('浏览器阻止'));
 assert(node('stop-import-check').disabled);assert(!node('import-link-submit').disabled);
 console.log('通过：网易/QQ共同检查、实际开头及中段播放、静音/取消清理、6路并发、音质排序和高音质失败降级、版本歌手保护、总数与完成进度、同档并行取消慢地址、低档延迟查询、失败保留、重复导入替换不重复、后台搜索隔离及自动播放受阻保护。');
})().catch(error=>{console.error(error);process.exitCode=1;});
