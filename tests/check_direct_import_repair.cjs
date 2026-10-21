const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
function boot(){
 const nodes=new Map(),storage=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{style:{},value:'',children:[],disabled:false,hidden:true,textContent:'',close(){},showModal(){this.open=true;},removeAttribute(){},appendChild(x){this.children.push(x);}});return nodes.get(id);};
 const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,document:{getElementById:node,addEventListener(){},querySelector:()=>({dataset:{tab:c.tab}}),querySelectorAll:()=>[],createElement:()=>({})},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
 c.tab='playlists';c.calls={probe:0,search:0};
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
 renderPlaylistList=()=>{};renderPlaylistOptions=()=>{};updateMainFavButton=()=>{};showToast=()=>{};showImportDialog=id=>$(id).showModal();
 probeRecording=async track=>{globalThis.calls.probe++;return globalThis.probe(track);};
 findBestImportRecording=async(track,signal,stage,verified,options)=>{globalThis.calls.search++;return globalThis.find(track,signal,verified,options);};
 globalThis.app={state,dom,runPlaylistImport,repairCurrentLibrary,stop:()=>importController.abort()};
})();`),c);
 c.app.dom.playlistSelect=node('select');return {c,a:c.app,node,storage};
}
const song=(id,source='qq')=>({uid:source+'-'+id,songid:id,source,title:'Song '+id,artist:'Singer'});
const chosen=t=>({...t,uid:'kuwo-'+t.songid,source:'kuwo',audioUrl:'https://audio.test/'+t.songid,importCheck:'playable'});
const tick=()=>new Promise(setImmediate);
(async()=>{
 const direct=boot(),tracks=Array.from({length:654},(_,i)=>({...song(String(i)),importCheck:i%2?'deferred':'unavailable',importCheckReason:'Old result'}));
 direct.c.probe=direct.c.find=()=>{throw Error('Import cannot search or inspect audio');};
 const started=Date.now();assert(await direct.a.runPlaylistImport(async()=>({version:1,favorites:[],playlists:[{id:'list',name:'Songs',tracks}]}),direct.node('status')));
 await tick();assert.equal(direct.a.state.playlists[0].tracks.length,654);assert.equal(direct.c.calls.probe,0);assert.equal(direct.c.calls.search,0);assert(direct.a.state.playlists[0].tracks.every(t=>!t.importCheck));assert.equal(JSON.parse(direct.storage.get('liusheng-library-v1')).playlists[0].tracks.length,654);assert(!direct.node('import-progress-dialog').open,'Direct import must not open the repair progress dialog');
 console.log('654-track metadata-only save: '+(Date.now()-started)+' ms; audio/search calls: 0');
 const fix=boot(),a=song('a','netease'),b=song('b'),c=song('c'),d=song('d'),other={id:'other',name:'Other',tracks:[b]};
 fix.c.tab='favorites';fix.a.state.favorites=[a,b,c,d];fix.a.state.playlists=[other];fix.a.state.favoriteSearch='no match';fix.a.state.currentTrack=a;fix.a.state.isPlaying=true;
 fix.c.probe=async t=>({...t,audioUrl:'https://audio.test/original'});
 fix.c.find=async(t,signal,verified,options)=>{assert.equal(options.compareAll,false);if(verified)return verified;if(t===c)throw Object.assign(Error('Temporary'),{retryable:true});if(t===d)return null;return chosen(t);};
 await fix.a.repairCurrentLibrary();assert.equal(fix.a.state.favorites[0].uid,a.uid);assert.equal(fix.a.state.favorites[1].uid,'kuwo-b');assert.equal(fix.a.state.favorites[2],c);assert.equal(fix.a.state.favorites[3],d);assert.equal(other.tracks[0],b,'Other lists remain unchanged');assert.equal(fix.a.state.currentTrack,a);assert(fix.a.state.isPlaying);assert(fix.node('import-check-status').textContent.includes('未修复 2 首'));assert.equal(JSON.parse(fix.storage.get('liusheng-library-v1')).favorites[1].uid,'kuwo-b');
 const removed=boot(),old=song('remove'),pl={id:'list',name:'List',tracks:[old]};removed.a.state.playlists=[pl];removed.a.dom.playlistSelect.value='list';
 let release;removed.c.find=()=>new Promise(resolve=>{release=resolve;});const pending=removed.a.repairCurrentLibrary();await tick();removed.a.state.playlists=[];release(chosen(old));await pending;assert.equal(removed.a.state.playlists.length,0,'Deleted lists are never resurrected');
 const edited=boot(),original=song('edit'),editedList={id:'list',name:'List',tracks:[original]};edited.a.state.playlists=[editedList];edited.a.dom.playlistSelect.value='list';edited.c.find=()=>new Promise(resolve=>{release=resolve;});const checking=edited.a.repairCurrentLibrary();await tick();const manual={...chosen(original),uid:'manual'};editedList.tracks[0]=manual;release(chosen(original));await checking;assert.equal(editedList.tracks[0],manual,'New manual replacements win over old inspection results');
 const stop=boot(),first=song('first'),second=song('second');stop.a.state.favorites=[first,second];stop.c.tab='favorites';stop.c.find=async t=>{if(t===first)return chosen(t);await tick();stop.a.stop();throw new DOMException('Stopped','AbortError');};await stop.a.repairCurrentLibrary();assert.equal(stop.a.state.favorites[0].uid,'kuwo-first');assert.equal(stop.a.state.favorites[1],second);assert.equal(JSON.parse(stop.storage.get('liusheng-library-v1')).favorites[0].uid,'kuwo-first');
 for(const id of ['retry-favorites-btn','retry-playlist-btn','upgrade-favorites-btn','upgrade-playlist-btn'])assert(!html.includes('id="'+id+'"'));
 assert(!source.includes('repairDeferredTracks'));assert(!source.includes('upgradeLibraryQuality'));assert(!source.includes('runVerifiedImport'));assert(html.includes('歌曲不能播放？'));
 console.log('通过：直接保存全部歌曲且零检测/零补查、主动检查范围及原曲优先、已验证替换持久化、失败保留、停止保留结果、删除及手动替换竞态保护、旧功能移除。');
})().catch(e=>{console.error(e);process.exitCode=1;});
