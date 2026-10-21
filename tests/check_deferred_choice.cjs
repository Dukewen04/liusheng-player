const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
class Node{
 constructor(){this.dataset={};this.style={};this.children=[];this.listeners=new Map();this.classList={add(){},remove(){},toggle(){}};this.value='';this.src='';this.currentTime=0;this.duration=180;this.plays=0;}
 addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,new Set());this.listeners.get(k).add(fn);}
 removeEventListener(k,fn){this.listeners.get(k)?.delete(fn);}
 emit(k){return Promise.all([...this.listeners.get(k)||[]].map(fn=>fn({preventDefault(){}})));}
 appendChild(el){this.children.push(el);}
 set innerHTML(value){this.children=[];} get innerHTML(){return '';}
 querySelectorAll(k){return this.children.flatMap(el=>[...(k==='button'&&el.tag==='button'?[el]:[]),...el.querySelectorAll(k)]);}
 showModal(){this.open=true;}close(){this.open=false;void this.emit('close');}
 pause(){}load(){}removeAttribute(){this.src='';}setAttribute(){}async play(){this.plays++;}
}
function boot(){
 const nodes=new Map(),storage=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,document:{getElementById:node,querySelector:node,querySelectorAll:()=>[],addEventListener(){},createElement:tag=>Object.assign(new Node(),{tag})},localStorage:{getItem(){return null;},setItem(k,v){storage.set(k,v);}}});
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
  searchNetease=(k,p,n,pool)=>globalThis.search('netease',k,pool);searchQQ=(k,n,pool)=>globalThis.search('qq',k,pool);
  searchKuwo=(k,n,pool)=>globalThis.search('kuwo',k,pool);searchJoox=(k,n,pool)=>globalThis.search('joox',k,pool);searchKugou=(k,n,pool)=>globalThis.search('kugou',k,pool);
  probeRecording=async track=>{globalThis.probes++;if(globalThis.failProbe)throw Error('broken');return {...track,audioUrl:'https://cdn.example/selected',detailsLoaded:true};};
  ensureTrackDetails=async track=>{track.audioUrl||='https://cdn.example/normal';track.detailsLoaded=true;};
  showImportDialog=id=>$(id).showModal();renderPlaylistList=()=>{};updateMainFavButton=()=>{};renderLyrics=()=>{};refreshTrackLyrics=async()=>{};setPlaybackIcon=()=>{};
  setupDOM();globalThis.app={state,dom,chooseDeferredReplacement,replaceDeferredLibraryTrack,playTrack,searchCurrentTrackSources,renderPlaybackQuality,openPlaybackQualityDialog};
 })();`),c);
 c.probes=0;c.search=async(name,k,pool)=>{if(name==='netease'&&!pool.trackMap.has('new')){const row={uid:'new',source:'netease',title:'Song',artist:'Singer',qualityLabel:'LOSSLESS'};pool.trackMap.set(row.uid,row);pool.searchResults.push(row);}};
 return {c,a:c.app,node,storage};
}
const original={uid:'old',source:'qq',title:'Song',artist:'Singer',importCheck:'deferred',importCheckReason:'Rate limited'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const x=boot();x.a.state.favorites=[original];x.a.state.playlists=[{id:'list',tracks:[original]}];
 await x.a.playTrack(original,{type:'favorites',index:0});
 assert.equal(x.a.state.favorites[0].uid,'new');assert.equal(x.a.state.playlists[0].tracks[0].uid,'new');assert.equal(x.a.state.currentTrack.uid,'new');assert.equal(x.a.state.favorites[0].importCheck,'playable');assert(!x.node('replacement-dialog').open);assert.equal(x.node('replacement-list').children.length,0,'No manual candidate selection');
 const manual=boot(),imported={...original,importCheck:undefined,audioUrl:'https://cdn.example/original'};manual.a.state.currentTrack=imported;manual.a.state.favorites=[imported];manual.a.state.playlists=[{id:'manual',tracks:[imported]}];manual.a.state.playContext={type:'playlist',playlistId:'manual',index:0};
 manual.a.renderPlaybackQuality();assert.equal(manual.node('playback-quality').textContent,'默认');manual.a.state.currentTrack={...imported,qualityLabel:'LOSSLESS'};manual.a.renderPlaybackQuality();assert.equal(manual.node('playback-quality').textContent,'无损');manual.a.state.currentTrack=imported;assert(html.includes('id="playback-quality" class="source-pill"'));assert(!html.includes("$('playback-quality').addEventListener"));
 const queried=new Set(),search=manual.c.search;manual.c.search=async(name,k,pool)=>{queried.add(name);return search(name,k,pool);};
 await manual.a.searchCurrentTrackSources();assert.equal(queried.size,5);assert.equal(manual.a.state.currentTrack.uid,'new');assert.equal(manual.a.state.playlists[0].tracks[0].uid,'new');assert.equal(manual.a.state.favorites[0].uid,'new');assert.equal(manual.a.state.playContext.playlistId,'manual');assert.equal(manual.a.state.playContext.index,0);
 const keep=boot();keep.a.state.currentTrack=imported;let release;const pendingSearch=new Promise(resolve=>release=resolve);keep.c.search=()=>pendingSearch;
 const keepPending=keep.a.searchCurrentTrackSources();await tick();assert(keep.node('replacement-dialog').open);await keep.node('replacement-close').emit('click');release();await keepPending;assert.equal(keep.a.state.currentTrack,imported);assert(!keep.node('replacement-dialog').open);
 const failed=boot();failed.a.state.currentTrack=imported;failed.a.state.favorites=[imported];failed.c.failProbe=true;await failed.a.searchCurrentTrackSources();assert.equal(failed.a.state.currentTrack,imported);assert.equal(failed.a.state.favorites[0],imported);
 console.log('通过：所有音源自动比较并应用最高可播音质、无需选择、替换收藏与歌单、取消及验证失败保留原曲。');
})().catch(e=>{console.error(e);process.exitCode=1;});
