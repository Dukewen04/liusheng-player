const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',value:'',hidden:false,disabled:false});return nodes.get(id);};
const c=vm.createContext({URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,console,document:{getElementById:node,addEventListener(){}},localStorage:{getItem(){return null;}}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
 searchNetease=(k,p,n,pool)=>globalThis.search('netease',k,pool);searchQQ=(k,n,pool)=>globalThis.search('qq',k,pool);
 searchKuwo=(k,n,pool)=>globalThis.search('kuwo',k,pool);searchJoox=(k,n,pool)=>globalThis.search('joox',k,pool);searchKugou=(k,n,pool)=>globalThis.search('kugou',k,pool);
 ensureTrackDetails=async track=>{globalThis.details.push(track.uid);Object.assign(track,{audioUrl:'https://cdn.example/'+track.uid,detailsLoaded:true});};
 probeRecording=async track=>{globalThis.probed.push(track.uid);if(track.broken||track.uid==='old')throw Error('No audio');return {...track};};
 showImportDialog=()=>{};renderPlaylistList=()=>{};updateMainFavButton=()=>{};rebuildLibraryTrackMap=()=>{};saveLibraryToStorage=()=>globalThis.saved++;showToast=()=>{};
 globalThis.app={state,dom,findHigherQualityRecording,findBestImportRecording,upgradeLibraryQuality,stop:()=>importController.abort(),replaceFinder:fn=>findHigherQualityRecording=fn};
})();`),c);
let catalog=[];c.details=[];c.probed=[];c.saved=0;let searches=0;
c.search=async(name,k,pool)=>{searches++;for(const track of catalog)if(track.source===name&&!pool.trackMap.has(track.uid)){pool.trackMap.set(track.uid,track);pool.searchResults.push({...track});}};
const original={uid:'old',source:'netease',title:'Song',artist:'Singer',quality:'128k',album:'Original Album'};
const candidate=(uid,quality,extra={})=>({...original,uid,source:'kuwo',quality,...extra});
const find=()=>c.app.findHigherQualityRecording(original,new AbortController().signal,()=>{});
(async()=>{
 catalog=[candidate('same','128k'),candidate('higher','320k'),candidate('wrong','lossless',{artist:'Other Singer'}),candidate('live','lossless',{title:'Song (Live)'})];
 const upgraded=await find();assert.equal(upgraded.uid,'higher');assert.equal(upgraded.album,original.album);assert.equal(upgraded.importOriginalUid,'old');assert(!c.probed.includes('wrong')&&!c.probed.includes('live'));
 for(const rows of [[],[candidate('same','128k')],[candidate('lower','48k')],[candidate('broken','lossless',{broken:true})]]){catalog=rows;assert.equal(await find(),null);}
 const before=searches;assert.equal(await c.app.findHigherQualityRecording({...original,quality:'lossless'},new AbortController().signal,()=>{}),null);assert.equal(searches,before);
 assert.equal(await c.app.findHigherQualityRecording({...original,quality:null},new AbortController().signal,()=>{}),null,'Unknown baseline is not assumed lower quality');
 catalog=[{...candidate('quick','128k'),source:'netease'},candidate('better','lossless')];c.details=[];c.probed=[];
 const imported=await c.app.findBestImportRecording(original,new AbortController().signal,()=>{},null,{compareAll:false});
 assert.equal(imported.uid,'quick');assert(c.details.includes('quick'));
 c.probed=[];const retry=await c.app.findBestImportRecording(original,new AbortController().signal,()=>{},null,{compareAll:false,failedAudioUrl:'https://cdn.example/quick'});assert.equal(retry.uid,'better');assert(!c.probed.includes('quick'),'Failed audio URLs are not replayed by fast imports');
 const other={...original,uid:'other',title:'Other'};const playing={...original};c.app.state.currentTrack=playing;
 for(const type of ['favorites','playlist']){
  c.app.state.favorites=[original,other];c.app.state.playlists=[{id:'selected',tracks:[original,other]},{id:'unrelated',tracks:[original]}];c.app.dom.playlistSelect=node('select');node('select').value='selected';
  c.app.replaceFinder(async track=>track.uid==='old'?upgraded:null);
  await c.app.upgradeLibraryQuality(type);
  const target=type==='favorites'?c.app.state.favorites:c.app.state.playlists[0].tracks;
  assert.equal(target[0].uid,'higher');assert.equal(target[1],other);assert.equal(c.app.state.playlists[1].tracks[0],original);
  assert.equal((type==='favorites'?c.app.state.playlists[0].tracks:c.app.state.favorites)[0],original);assert.equal(c.app.state.currentTrack,playing);
  assert(node('import-check-status').textContent.includes('已升级 1 首'));assert(node('stop-import-check').disabled);
 }
 c.app.state.favorites=[original,{...upgraded,quality:'lossless'}];c.app.replaceFinder(async track=>track.uid==='old'?upgraded:null);await c.app.upgradeLibraryQuality('favorites');assert.equal(c.app.state.favorites.length,1);assert.equal(c.app.state.favorites[0].quality,'lossless','Deduplication must not downgrade an existing entry');
 c.app.state.favorites=[original];c.app.replaceFinder(async()=>{throw Error('Network error');});await c.app.upgradeLibraryQuality('favorites');assert.equal(c.app.state.favorites[0],original);
 c.app.replaceFinder(async(track,signal)=>{c.app.stop();throw signal.reason;});await c.app.upgradeLibraryQuality('favorites');assert.equal(c.app.state.favorites[0],original);assert(node('import-check-status').textContent.includes('未处理 1 首'));
 assert(!html.includes('id="import-compare-all"'));assert(!html.includes('id="import-check-mode"'));assert(html.includes('id="upgrade-favorites-btn"')&&html.includes('id="upgrade-playlist-btn"'));
 const progress=html.split('<dialog id="import-progress-dialog"')[1].split('</dialog>')[0];assert(!progress.includes('class="import-note"'));
 console.log('通过：导入遇可播即保留、独立升级仅替换严格更高且验证通过的同版本、低档/同档/未知/错误不改、无损跳过、收藏与当前歌单隔离、停止保留、播放不打断、精简导入弹框。');
})().catch(e=>{console.error(e);process.exitCode=1;});
