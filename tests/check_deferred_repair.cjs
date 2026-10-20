const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
function boot(){
 const nodes=new Map(),storage=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:true,value:'',textContent:'',style:{},children:[],showModal(){this.open=true;},close(){this.open=false;},removeAttribute(){},appendChild(t){this.children.push(t);}});return nodes.get(id);};
 const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,document:{getElementById:node,visibilityState:'visible',querySelectorAll:()=>[],addEventListener(){},createElement:()=>({})},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
 renderPlaylistList=()=>{};renderPlaylistOptions=()=>{};updateMainFavButton=()=>{};showToast=()=>{};showImportDialog=id=>$(id).showModal();
 findBestImportRecording=(track,signal,stage,verified,options)=>globalThis.find(track,signal,options);
 probeRecording=async track=>({...track,audioUrl:'https://cdn.example/original'});
 musicDelay=async(ms,signal)=>{globalThis.delays.push(ms);if(signal?.aborted)throw signal.reason;};
 globalThis.app={state,dom,repairDeferredTracks,applyDeferredRepair,retryDeferredLibrary,runVerifiedImport,getImportDiagnostic,cool:()=>musicServiceCooldowns.set('https://apicx.asia/api/joox_music',Date.now()+5000)};
 })();`),c);c.delays=[];c.app.dom.playlistSelect=node('select');return {c,a:c.app,node,storage};
}
const old=(uid,extra={})=>({uid,source:'qq',songid:uid,title:'Song '+uid,artist:'Singer',importCheck:'deferred',importCheckReason:'Temporary service error',...extra});
const replacement=t=>({...t,uid:'kuwo-'+t.uid,source:'kuwo',audioUrl:'https://cdn.example/'+t.uid,importCheck:'playable'});
const tick=()=>new Promise(setImmediate);
(async()=>{
 const x=boot(),songs=Array.from({length:6},(_,i)=>old('old'+i)),good={...old('good'),importCheck:'playable'},ambiguous=old('amb',{importCheckReason:'同一歌手有多个相近歌名'});
 x.a.state.favorites=[...songs,good,ambiguous];x.a.state.playlists=[{id:'list',tracks:[songs[0]]}];const playing={uid:'playing'};x.a.state.currentTrack=playing;
 let active=0,max=0;const searched=[];
 x.c.find=async(track,signal,options)=>{assert.equal(options.compareAll,false);assert(options.skipQQ);searched.push(track.uid);active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return replacement(track);};
 const updates=[];await x.a.repairDeferredTracks(x.a.state.favorites,new AbortController(),s=>updates.push(s));
 assert.equal(max,2);assert.equal(searched.length,6);assert.equal(updates.at(-1).recovered,6);assert.equal(updates.at(-1).total,6);assert.equal(x.a.state.favorites[6],good);assert.equal(x.a.state.favorites[7],ambiguous);assert.equal(x.a.state.currentTrack,playing);
 assert.equal(x.a.state.playlists[0].tracks[0].uid,'kuwo-old0');assert(!x.a.state.favorites[0].importCheckReason,'Successful verification clears the old failure reason');assert(x.storage.get('liusheng-library-v1').includes('kuwo-old0'));

 const failed=boot(),unavailable=old('none'),temporary=old('temp');failed.a.state.favorites=[unavailable,temporary];failed.c.find=async t=>{if(t.uid==='temp')throw Object.assign(Error('retry later'),{retryable:true});return null;};
 await failed.a.repairDeferredTracks(failed.a.state.favorites,new AbortController(),()=>{});assert.equal(failed.a.state.favorites[0],unavailable);assert.equal(failed.a.state.favorites[1],temporary,'Retry never deletes or relabels unsuccessful rows');
 const wrong=replacement(unavailable);wrong.artist='Different singer';assert(!failed.a.applyDeferredRepair(unavailable,wrong));

 const removed=boot(),deleted=old('deleted');removed.a.state.favorites=[deleted];let finish;
 removed.c.find=()=>new Promise(resolve=>finish=resolve);const removing=removed.a.repairDeferredTracks(removed.a.state.favorites,new AbortController(),()=>{});await tick();removed.a.state.favorites=[];finish(replacement(deleted));await removing;assert.equal(removed.a.state.favorites.length,0,'Deleting a row during retry must not resurrect it');
 const chosen=old('chosen'),manual={...chosen,importCheck:'playable'};removed.a.state.favorites=[manual];assert(!removed.a.applyDeferredRepair(chosen,replacement(chosen)),'A newer manual choice is not overwritten');
 const duplicate=old('duplicate'),existing=replacement(duplicate);removed.a.state.favorites=[duplicate,existing];assert(removed.a.applyDeferredRepair(duplicate,{...existing,quality:'128k'}));assert.equal(removed.a.state.favorites.length,1);assert.equal(removed.a.state.favorites[0],existing,'An existing verified duplicate keeps its version');

 const stopped=boot(),stop=new AbortController();stopped.a.state.favorites=[old('first'),old('second'),old('third')];
 stopped.c.find=(t,signal)=>t.uid==='first'?Promise.resolve(replacement(t)):new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 await stopped.a.repairDeferredTracks(stopped.a.state.favorites,stop,s=>{if(s.recovered===1)stop.abort();});assert.equal(stopped.a.state.favorites[0].importCheck,'playable');assert(stopped.a.state.favorites.slice(1).every(t=>t.importCheck==='deferred'));

 const auto=boot(),imported=old('imported');let attempts=0,firstWasSaved=false;
 auto.c.find=async t=>{attempts++;if(attempts===1)throw Object.assign(Error('temporary'),{retryable:true});firstWasSaved=auto.storage.get('liusheng-library-v1')?.includes('deferred');return replacement(t);};
 assert(await auto.a.runVerifiedImport(async()=>({version:1,favorites:[],playlists:[{id:'import',name:'Imported',tracks:[imported]}]}),auto.node('status')));
 assert(firstWasSaved,'First-pass results are saved before automatic retry starts');assert.equal(auto.a.state.playlists[0].tracks[0].importCheck,'playable');assert(auto.node('status').textContent.includes('新恢复 1 首'));
 const report=auto.a.getImportDiagnostic();assert.equal(report.counts.total,1);assert.equal(report.counts.replaced,1);assert.equal(report.counts.deferred,0);assert.equal(report.retry.recovered,1);assert.equal(typeof report.initialElapsedMs,'number');

 const scoped=boot();scoped.a.state.favorites=[old('fav')];scoped.a.state.playlists=[{id:'other',tracks:[old('other')]}];scoped.c.find=async t=>replacement(t);scoped.a.cool();await scoped.a.retryDeferredLibrary('favorites');assert(scoped.c.delays[0]>0&&scoped.c.delays[0]<=5000);assert.equal(scoped.a.state.favorites[0].importCheck,'playable');assert.equal(scoped.a.state.playlists[0].tracks[0].importCheck,'deferred');
 const blocked=boot();blocked.a.state.favorites=[old('blocked')];blocked.c.find=async()=>{throw Object.assign(Error('Autoplay blocked'),{name:'NotAllowedError'});};await blocked.a.retryDeferredLibrary('favorites');assert(blocked.node('import-check-status').textContent.includes('浏览器阻止'));assert.equal(blocked.a.state.favorites[0].importCheck,'deferred');
 assert(html.includes('id="retry-favorites-btn"')&&html.includes('id="retry-playlist-btn"'));
 console.log('通过：暂未验证2路补查、跳过已通过与歧义、仅验证成功替换并保存、失败保留、删除不复活、手动选择不覆盖、重复不降级、停止保留已恢复、首轮先保存、诊断总数不变、手动按收藏/歌单范围补查及冷却等待。');
})().catch(e=>{console.error(e);process.exitCode=1;});
