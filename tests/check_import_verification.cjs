const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const nodes=new Map(),storage=new Map();
function node(id){if(!nodes.has(id))nodes.set(id,{showModal(){this.open=true;},close(){this.open=false;},value:'',textContent:'',disabled:false,style:{},children:[],appendChild(child){this.children.push(child);},removeAttribute(key){delete this[key];},setAttribute(key,value){this[key]=value;}});return nodes.get(id);}
const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,setImmediate,
  window:{scrollX:0,scrollY:240,scrollTo(x,y){this.scrollX=x;this.scrollY=y;}},document:{body:{style:{position:'',top:'',left:'',width:'',overflow:''}},documentElement:{style:{overflow:''}},getElementById:node,createElement:()=>({}),addEventListener(){},querySelectorAll:()=>[]},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
 renderPlaylistList=()=>{};renderPlaylistOptions=()=>{};updateMainFavButton=()=>{};
 globalThis.app={state,dom,verifyImportData,findBestImportRecording,importQualityRank,probeRecording,runVerifiedImport,importPlaylistData,serializeTrack,removeUnavailableImports,loadLibraryFromStorage,importWorkerLimit,showImportDialog,restoreImportScroll,
   probe:fn=>probeRecording=fn,details:fn=>ensureTrackDetails=fn,
   providers:fn=>{searchNetease=(k,p,n,pool)=>fn('netease',k,pool);searchQQ=(k,n,pool)=>fn('qq',k,pool);searchKuwo=(k,n,pool)=>fn('kuwo',k,pool);searchJoox=(k,n,pool)=>fn('joox',k,pool);searchKugou=(k,n,pool)=>fn('kugou',k,pool);},
   qqSearch:fn=>searchQQ=fn,searches:fn=>{searchNetease=fn;searchQQ=async()=>{};searchKuwo=async()=>{};searchJoox=async()=>{};searchKugou=async()=>{};}};
})();`),c);
const a=c.app;node('import-compare-all').checked=true;
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
 const AudioClass=c.Audio;c.Audio=class extends AudioClass{play(){return Promise.reject(new Error('Audio unavailable'));}};
 await assert.rejects(a.probeRecording(original('failed-audio'),{signal:new AbortController().signal,silent:true}),error=>error.failedAudioUrl==='https://cdn.example/good');
 c.Audio=AudioClass;

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
 const progress=[],data=payload([original('original-qq'),{...original('good-netease','netease'),title:'Other Song'}]);data.favorites=[data.playlists[0].tracks[0]];
 const checked=await a.verifyImportData(data,new AbortController(),stats=>progress.push(stats));
 assert.equal(checked.stats.total,2,'A song in both favorites and a playlist is checked once');assert.equal(checked.stats.replaced,1);assert.equal(checked.stats.passed,1);assert.equal(checked.stats.pending,0);
 assert.equal(checked.data.playlists[0].tracks[0].uid,'qq-choice');assert.equal(checked.data.playlists[0].tracks[0].importOriginalUid,'original-qq');assert.equal(checked.data.playlists[0].tracks[0].qualityLabel,'HQ');
 assert(attempted.indexOf('https://cdn.example/broken-flac')<attempted.indexOf('https://cdn.example/qq-hq'));
 assert.equal(compatibleLoads,0,'Do not wait for lower-tier addresses when lossless is playable');
 assert(!attempted.includes('https://cdn.example/kuwo-choice'),'Prefer a playable NetEase/QQ exact version before other sources');
 assert(!loaded.includes('wrong-version')&&!loaded.includes('wrong-singer'));assert.equal(a.state.searchResults.length,0,'Repair searches must not overwrite the user search');
 assert.equal(data.playlists[0].tracks[0].uid,'original-qq','Verification must not mutate input data');
 assert.equal(progress.at(-1).checked,2);assert(progress.some(item=>item.active.some(text=>text.includes('比较候选音质'))));

 // Compare NetEase and QQ exact versions first, regardless of the manual search checkboxes.
 const savedEnabled=a.state.enabledSources;a.state.enabledSources={netease:false,qq:false,kuwo:false,joox:false,kugou:false};
 for(const source of ['netease','qq']){
   const base={...original('playable-'+source,source),quality:'128k'};
   const target=source==='netease'?'qq':'netease',seenSources=new Set();
   const better={...original(target+'-lossless',target),tier:'lossless'};
   a.providers(async(name,keyword,pool)=>{seenSources.add(name);if(name===target&&!pool.trackMap.has(better.uid)){pool.trackMap.set(better.uid,better);pool.searchResults.push({...better});}});
   a.details(async track=>Object.assign(track,{audioUrl:'https://cdn.example/'+track.uid,quality:track.tier==='lossless'?'lossless':'128k',qualityLabel:track.tier==='lossless'?'LOSSLESS':'STD'}));
   a.probe(async(track,options)=>options.useLoaded?{...track}:{...track,audioUrl:'https://cdn.example/'+track.uid,quality:'128k',qualityLabel:'STD'});
   const upgraded=await a.verifyImportData(payload([base]),new AbortController(),()=>{});
   assert.equal(seenSources.size,2);assert.equal(upgraded.data.playlists[0].tracks[0].source,target);assert.equal(upgraded.data.playlists[0].tracks[0].quality,'lossless');assert.equal(upgraded.stats.replaced,1);assert.equal(upgraded.stats.passed,0);assert.equal(upgraded.data.playlists[0].tracks[0].importOriginalUid,base.uid);
 }
 a.state.enabledSources=savedEnabled;
 // Opting out keeps a playable original without unnecessary searching.
 let legacySearches=0;a.providers(async()=>{legacySearches++;throw Error('Unexpected cross-source search');});
 a.probe(async track=>({...track,audioUrl:'https://cdn.example/original.mp3',quality:'128k'}));
 const legacy=await a.verifyImportData(payload([original('legacy','netease')]),new AbortController(),()=>{},{compareAll:false});
 assert.equal(legacySearches,0);assert.equal(legacy.stats.passed,1);assert.equal(legacy.data.playlists[0].tracks[0].uid,'legacy');assert.equal(legacy.data.playlists[0].tracks[0].quality,'128k');
 // With the option off, a failed original still falls back to all five sources.
 const rescueSources=new Set();const rescue={...original('rescue','kuwo'),tier:'lossless'};
 a.providers(async(name,keyword,pool)=>{rescueSources.add(name);if(name==='kuwo'&&!pool.trackMap.has(rescue.uid)){pool.trackMap.set(rescue.uid,rescue);pool.searchResults.push({...rescue});}});
 a.details(async track=>{if(track.uid==='broken')throw Error('Original unavailable');Object.assign(track,{audioUrl:'https://cdn.example/'+track.uid,quality:track.tier==='lossless'?'lossless':'128k'});});
 a.probe(async(track,options)=>{if(!options.useLoaded)throw Error('Original unavailable');return {...track};});
 const rescued=await a.verifyImportData(payload([original('broken','netease')]),new AbortController(),()=>{},{compareAll:false});
 assert.equal(rescueSources.size,5);assert.equal(rescued.stats.replaced,1);assert.equal(rescued.data.playlists[0].tracks[0].source,'kuwo');

 // Bulk quality selection checks the highest tier first, ignoring an old compatible preference.
 a.searches(async()=>{});let refreshed=false;
 const compatibleOriginal={...original('same-source'),preferCompatible:true};
 a.details(async()=>{refreshed=true;throw Error('Unexpected duplicate metadata request');});
 a.probe(async track=>{assert(track.preferHighestQuality);assert(!track.preferCompatible);return {...track,audioUrl:'https://cdn.example/sq.flac',quality:'lossless',qualityLabel:'LOSSLESS',audioOptions:[{audioUrl:'https://cdn.example/sq.flac',quality:'lossless',qualityLabel:'LOSSLESS',preferredAudioQuality:'song_play_url_sq'}]};});
 const ownUpgrade=await a.verifyImportData(payload([compatibleOriginal]),new AbortController(),()=>{});
 assert(!refreshed);assert.equal(ownUpgrade.stats.passed,1);assert.equal(ownUpgrade.data.playlists[0].tracks[0].preferredAudioQuality,'song_play_url_sq');assert(!ownUpgrade.data.playlists[0].tracks[0].preferCompatible);
 // Keep the already-tested original if higher tiers and other providers fail, without replaying it.
 let originalProbes=0;
 a.providers(async()=>{throw Error('Provider unavailable');});a.details(async()=>{throw Error('Details unavailable');});
 a.probe(async track=>{originalProbes++;return {...track,audioUrl:'https://cdn.example/known-hq.mp3',qualityLabel:'HQ',quality:'normal',audioOptions:[{audioUrl:'https://cdn.example/known-hq.mp3',quality:'normal',qualityLabel:'HQ',preferredAudioQuality:'song_play_url_hq'}]};});
 const retained=await a.verifyImportData(payload([original('fallback-original')]),new AbortController(),()=>{});
 assert.equal(retained.stats.passed,1);assert.equal(retained.stats.failed,0);assert.equal(originalProbes,1);assert.equal(retained.data.playlists[0].tracks[0].preferredAudioQuality,'song_play_url_hq');
 // Restore detail/search fixtures for tier fallback tests.
 a.searches(async(keyword,page,limit,pool)=>{for(const track of candidates)if(!pool.trackMap.has(track.uid)){pool.trackMap.set(track.uid,track);pool.searchResults.push({...track});}});
 a.details(async track=>{if(track.tier==='qq')Object.assign(track,{audioUrl:'https://cdn.example/broken-flac',quality:'lossless',qualityLabel:'LOSSLESS',audioOptions:[{audioUrl:'https://cdn.example/broken-flac',quality:'lossless',qualityLabel:'LOSSLESS'},{audioUrl:'https://cdn.example/qq-hq',quality:'normal',qualityLabel:'HQ',preferredAudioQuality:'hq'}]});else Object.assign(track,{audioUrl:'https://cdn.example/'+track.uid+(track.preferCompatible?'-low':''),quality:track.preferCompatible?'normal':track.tier==='lossless'?'lossless':'320k',qualityLabel:track.preferCompatible?'STD':track.tier==='lossless'?'LOSSLESS':'320K'});});

 // If lossless candidates fail, the best remaining playable tier wins.
 attempted.length=0;
 a.probe(async track=>{attempted.push(track.audioUrl);if(track.quality==='lossless')throw Error('decode');return {...track};});
 const fallback=await a.findBestImportRecording(original('original'),new AbortController().signal,()=>{});
 assert.equal(a.importQualityRank(fallback),320);assert(!fallback.audioUrl.endsWith('-low'));
 assert.equal(a.serializeTrack(fallback).preferHighestQuality,true);assert(!a.serializeTrack(fallback).audioOptions,'Do not store signed playback URLs');

 // A hanging lossless URL must not block another playable URL of the same tier.
 const racing=[{...original('slow'),tier:'lossless'},{...original('fast'),tier:'lossless'},{...original('lower'),tier:'320k'}];
 a.searches(async(keyword,page,limit,pool)=>{for(const track of racing)if(!pool.trackMap.has(track.uid)){pool.trackMap.set(track.uid,track);pool.searchResults.push({...track});}});
 a.details(async track=>Object.assign(track,{audioUrl:'https://cdn.example/'+track.uid,quality:track.tier}));
 let hangingAborted=false;const raced=[];
 a.probe(async(track,{signal})=>{raced.push(track.uid);if(track.uid==='slow')return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{hangingAborted=true;reject(signal.reason);},{once:true}));return {...track};});
 const best=await a.findBestImportRecording(original('original'),new AbortController().signal,()=>{});
 assert.equal(best.uid,'fast');assert(hangingAborted,'Cancel the slower probe once a same-quality candidate passes');assert.deepEqual(raced,['slow','fast']);

 // A slow source must not delay the next search round of a fast source.
 const fastQueries=[],slowQueries=[];let finishSlow;
 const slowSearch=new Promise(resolve=>finishSlow=resolve);
 a.searches(async(keyword,page,limit,pool)=>{fastQueries.push(keyword);if(!pool.trackMap.has('found')){const track={...original('found'),tier:'lossless'};pool.trackMap.set(track.uid,track);pool.searchResults.push(track);}});
 a.qqSearch(async keyword=>{slowQueries.push(keyword);if(slowQueries.length===1)await slowSearch;});
 const pipelined=a.findBestImportRecording(original('original'),new AbortController().signal,()=>{});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(fastQueries.length,2);assert.equal(slowQueries.length,1);
 assert.equal((await pipelined).uid,'found');finishSlow();await new Promise(resolve=>setImmediate(resolve));assert.equal(slowQueries.length,1,'Cancel the slow source before it starts another round after playable lossless is found');
 a.searches(async(keyword,page,limit,pool)=>{for(const track of racing)if(!pool.trackMap.has(track.uid)){pool.trackMap.set(track.uid,track);pool.searchResults.push({...track});}});

 // Do not drop to 320K while any lossless probe is still pending.
 const failLossless=[];const stages=[];
 a.probe(async track=>{stages.push(track.uid);if(track.quality==='lossless')return new Promise((resolve,reject)=>failLossless.push(()=>reject(Error('unavailable'))));return {...track};});
 const ordered=a.findBestImportRecording(original('original'),new AbortController().signal,()=>{});
 while(failLossless.length<2)await new Promise(resolve=>setImmediate(resolve));
 assert(!stages.includes('lower'));failLossless.forEach(fail=>fail());assert.equal((await ordered).uid,'lower');

 const stopReplacement=new AbortController();let pendingProbes=0;
 a.probe(async(track,{signal})=>new Promise((resolve,reject)=>{pendingProbes++;signal.addEventListener('abort',()=>{pendingProbes--;reject(signal.reason);},{once:true});}));
 const stopping=a.findBestImportRecording(original('original'),stopReplacement.signal,()=>{});
 while(pendingProbes<2)await new Promise(resolve=>setImmediate(resolve));
 stopReplacement.abort();await assert.rejects(stopping,error=>error.name==='AbortError');assert.equal(pendingProbes,0);
 a.probe(async()=>{const error=new Error('Blocked');error.name='NotAllowedError';throw error;});
 await assert.rejects(a.findBestImportRecording(original('original'),new AbortController().signal,()=>{}),error=>error.name==='NotAllowedError');

 // Do not wait for slow candidate metadata after a lossless track has passed playback.
 let detailCanceled=false;
 a.searches(async(keyword,page,limit,pool)=>{for(const uid of ['ready-lossless','slow-details'])if(!pool.trackMap.has(uid)){const track=original(uid);pool.trackMap.set(uid,track);pool.searchResults.push(track);}});
 a.details(async(track,{signal})=>{
   if(track.uid==='slow-details')await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{detailCanceled=true;reject(signal.reason);},{once:true}));
   else Object.assign(track,{audioUrl:'https://cdn.example/'+track.uid,quality:track.uid==='ready-lossless'?'lossless':'128k',qualityLabel:track.uid==='ready-lossless'?'LOSSLESS':'STD'});
 });
 a.probe(async track=>({...track}));
 assert.equal((await a.findBestImportRecording(original('original'),new AbortController().signal,()=>{})).uid,'ready-lossless');assert(detailCanceled);

 a.searches(async(keyword,page,limit,pool)=>{if(!pool.trackMap.has('low-only')){const t={...original('low-only','kuwo')};pool.trackMap.set(t.uid,t);pool.searchResults.push(t);}});
 a.details(async track=>{if(!track.preferCompatible)throw Error('Lossless endpoint unavailable');Object.assign(track,{audioUrl:'https://cdn.example/low-only',quality:'normal',qualityLabel:'STD'});});
 a.probe(async track=>({...track}));
 const lowOnly=await a.findBestImportRecording(original('original'),new AbortController().signal,()=>{});
 assert(lowOnly.preferCompatible);assert(a.serializeTrack(lowOnly).preferCompatible,'Persist a tested compatible tier instead of refreshing back to broken lossless');

 a.searches(async()=>{});a.probe(async()=>{throw Error('Unavailable');});
 const failed=await a.verifyImportData(payload([original('original-qq'),original('original-netease','netease')]),new AbortController(),()=>{});
 assert.equal(failed.stats.failed,2);assert.equal(failed.failures.length,2);assert.equal(failed.data.playlists[0].tracks.length,0,'Do not import failed tracks');
 const canceled=new AbortController();let active=0,maxActive=0;
 a.probe(async(track,{signal})=>{active++;maxActive=Math.max(maxActive,active);await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{active--;reject(signal.reason);},{once:true}));});
 const pending=a.verifyImportData(payload(Array.from({length:16},(_,i)=>original('original-'+i))),canceled,()=>{});
 canceled.abort();const partial=await pending;assert.equal(maxActive,12);assert.equal(partial.stats.pending,16);assert(partial.data.playlists[0].tracks.every(track=>track.importCheck==='pending'));assert.equal(active,0);

 // Coarse touch devices use eight original probes; repair searches remain capped at six.
 c.matchMedia=()=>({matches:true});assert.equal(a.importWorkerLimit(),8);active=0;maxActive=0;
 const mobileController=new AbortController();
 const mobile=a.verifyImportData(payload(Array.from({length:16},(_,i)=>original('mobile-'+i))),mobileController,()=>{});
 mobileController.abort();await mobile;assert.equal(maxActive,8);assert.equal(active,0);delete c.matchMedia;
 let searching=0,maxSearching=0;const repairingController=new AbortController();
 a.probe(async()=>{throw Error('Unavailable');});
 a.searches(async(keyword,page,limit,pool)=>{searching++;maxSearching=Math.max(maxSearching,searching);await new Promise((resolve,reject)=>pool.signal.addEventListener('abort',()=>{searching--;reject(pool.signal.reason);},{once:true}));});
 const repairing=a.verifyImportData(payload(Array.from({length:24},(_,i)=>original('repair-'+i))),repairingController,()=>{});
 while(searching<6)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(maxSearching,6);repairingController.abort();const stoppedRepairs=await repairing;assert.equal(searching,0);assert.equal(stoppedRepairs.stats.pending,24);

 // Failed imported rows and old tagged rows are removed; untested rows survive migration.
 const tagged={...original('tagged'),importCheck:'unavailable'},untested={...original('untested'),importCheck:'pending'};
 a.state.favorites=[tagged,untested];a.state.playlists=[{id:'remove-test',name:'Remove',tracks:[tagged,untested]}];
 a.state.trackMap.set(tagged.uid,tagged);assert.equal(a.removeUnavailableImports(),2);assert(!a.state.trackMap.has(tagged.uid));assert.equal(a.state.favorites[0].uid,'untested');
 storage.set('liusheng-library-v1',JSON.stringify({favorites:[tagged,untested],playlists:[{id:'migration',name:'Migration',tracks:[tagged,untested]}]}));
 a.loadLibraryFromStorage();assert.equal(a.state.favorites.length,1);assert.equal(a.state.playlists[0].tracks.length,1);assert(!JSON.stringify(JSON.parse(storage.get('liusheng-library-v1'))).includes('tagged'));
 a.state.favorites=[original('original-qq'),untested];a.state.playlists=[{id:'remove-test',name:'Remove',tracks:[original('original-netease','netease'),untested]}];
 assert.equal(a.removeUnavailableImports(failed.failures),2);assert.equal(a.state.favorites.length,1);assert.equal(a.state.playlists[0].tracks.length,1);

 // Background scrolling stays locked across the dialog transition and restores on close/Esc.
 node('import-progress-dialog').close();node('import-link-dialog').close();
 c.window.scrollY=360;c.document.body.style.position='relative';c.document.documentElement.style.overflow='auto';
 a.showImportDialog('import-link-dialog');assert.equal(c.document.body.style.position,'fixed');assert.equal(c.document.body.style.top,'-360px');assert.equal(c.document.documentElement.style.overflow,'hidden');
 node('import-link-dialog').close();a.showImportDialog('import-progress-dialog');a.restoreImportScroll();assert.equal(c.document.body.style.position,'fixed');
 node('import-progress-dialog').close();a.restoreImportScroll();assert.equal(c.document.body.style.position,'relative');assert.equal(c.document.documentElement.style.overflow,'auto');assert.equal(c.window.scrollY,360);

 // Re-import repairs the old entry in place and keeps unrelated tracks and favorites.
 const old=original('original-qq'),unrelated={...original('unrelated'),title:'Other'};
 a.state.favorites=[unrelated];a.state.playlists=[{id:'example-list',name:'Example',tracks:[old,unrelated]}];a.state.trackMap=new Map([[old.uid,old],[unrelated.uid,unrelated]]);
 a.importPlaylistData(checked.data);
 assert.equal(a.state.playlists[0].tracks.length,3);assert.equal(a.state.playlists[0].tracks[0].uid,'qq-choice');assert(a.state.playlists[0].tracks.includes(unrelated));
 a.importPlaylistData(checked.data);assert.equal(a.state.playlists[0].tracks.length,3,'Re-import never appends another replacement');
 const upgraded={...checked.data.playlists[0].tracks[0],uid:'higher-quality',songid:'higher-quality'};
 a.importPlaylistData(payload([upgraded]));assert.equal(a.state.playlists[0].tracks[0].uid,'higher-quality');assert.equal(a.state.playlists[0].tracks.length,3);
 assert.equal(JSON.parse(storage.get('liusheng-library-v1')).playlists[0].tracks[0].importCheck,'playable');

 a.searches(async()=>{});a.probe(async track=>({...track,audioUrl:'https://cdn.example/'+track.uid,quality:'320k'}));a.dom.playlistSelect=node('select');
 const observed=[];let countText='';Object.defineProperty(node('import-check-count'),'textContent',{get(){return countText;},set(value){countText=value;observed.push(value);},configurable:true});
 assert(await a.runVerifiedImport(async()=>payload([original('progress-1'),original('progress-2')]),node('status')));
 assert(observed.includes('共 2 首 · 已完成 0 首 · 剩余 2 首'));assert.equal(countText,'共 2 首 · 已完成 2 首 · 剩余 0 首');
 assert.equal(node('import-check-progress').max,2);assert.equal(node('import-check-progress').value,2);

 // Removing all failed favorites still persists deletion when no playlist is imported.
 const doomed=original('doomed'),saved=original('saved');
 a.state.favorites=[doomed,saved];a.state.playlists=[];a.searches(async()=>{});a.probe(async()=>{throw Error('Unavailable');});
 assert(await a.runVerifiedImport(async()=>({version:1,favorites:[doomed],playlists:[]}),node('status')));
 assert.equal(a.state.favorites.length,1);assert.equal(a.state.favorites[0].uid,'saved');assert.equal(JSON.parse(storage.get('liusheng-library-v1')).favorites[0].uid,'saved');assert(node('status').textContent.includes('已移除 1'));

 const coverRow={...original('old-cover'),title:'Song (cover Original Singer)',artist:'Cover Singer'};
 const originalRow={...original('true-original'),artist:'Original Singer',importOriginalUid:coverRow.uid,originalArtist:'Original Singer',originalArtistStatus:'identified',importCheck:'playable'};
 a.state.favorites=[coverRow];a.state.trackMap.set(coverRow.uid,coverRow);
 a.importPlaylistData({favorites:[originalRow],playlists:[]});
 assert.equal(a.state.favorites.length,1,'A verified original-singer fallback replaces the unavailable old entry instead of appending a duplicate');
 assert.equal(a.state.favorites[0].uid,'true-original');
 a.probe(async()=>{const error=new Error('Autoplay blocked');error.name='NotAllowedError';throw error;});
 const before=JSON.stringify(a.state.playlists);
 assert.equal(await a.runVerifiedImport(async()=>payload([original('blocked')]),node('status')),false);
 assert.equal(JSON.stringify(a.state.playlists),before);assert(node('status').textContent.includes('浏览器阻止'));
 assert(node('stop-import-check').disabled);assert(!node('import-link-submit').disabled);
 a.providers(async()=>{});
 const temporary=Object.assign(new Error('Provider throttled'),{retryable:true});
 a.probe(async()=>{throw temporary;});a.details(async()=>{throw temporary;});
 const deferred=await a.verifyImportData(payload([original('temporary-qq')]),new AbortController(),()=>{});
 assert.equal(deferred.stats.failed,0);assert.equal(deferred.stats.deferred,1);assert.equal(deferred.stats.checked,1);assert.equal(deferred.stats.pending,0);
 assert.equal(deferred.failures.length,0);assert.equal(deferred.data.playlists[0].tracks[0].importCheck,'deferred');assert.equal(deferred.data.playlists[0].tracks[0].uid,'temporary-qq');
 console.log('通过：网易云与QQ原版本优先择优、取消音质优选保留可播原曲、原平台音质升级及可播原曲兜底、网易/QQ共同检查、实际开头及中段播放、静音/取消清理、电脑12/手机8路检查、替换搜索单独限流、音质排序和高音质失败降级、版本歌手保护、总数与完成进度、同档并行取消慢地址、低档延迟查询、失败移除、停止保留未检查、限流及临时错误保留不误删、重复导入替换不重复、后台搜索隔离及自动播放受阻保护。');
})().catch(error=>{console.error(error);process.exitCode=1;});
