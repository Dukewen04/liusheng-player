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
 c.probes=0;c.search=async(name,k,pool)=>{if(name==='netease'&&!pool.trackMap.has('new')){const row={uid:'new',source:'netease',title:'Song',artist:'Singer'};pool.trackMap.set(row.uid,row);pool.searchResults.push(row);}};
 return {c,a:c.app,node,storage};
}
const original={uid:'old',source:'qq',title:'Song',artist:'Singer',importCheck:'deferred',importCheckReason:'Rate limited'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const x=boot();x.a.state.favorites=[original];x.a.state.playlists=[{id:'list',tracks:[original]}];
 const pending=x.a.playTrack(original,{type:'favorites',index:0});await tick();
 assert(x.node('replacement-dialog').open);assert.equal(x.c.probes,0,'Search must not auto-select or probe a candidate');assert.equal(x.a.dom.audio.plays,0);assert.equal(x.a.state.favorites[0],original);
 const button=x.node('replacement-list').querySelectorAll('button')[0];assert(button);
 x.c.failProbe=true;await button.emit('click');assert.equal(x.a.state.favorites[0],original);assert(x.node('replacement-status').textContent.includes('其他版本'));assert(!button.disabled);
 x.c.failProbe=false;await button.emit('click');await pending;
 assert.equal(x.a.state.favorites[0].uid,'new');assert.equal(x.a.state.playlists[0].tracks[0].uid,'new');assert.equal(x.a.state.favorites[0].importCheck,'playable');assert.equal(x.a.state.favorites[0].importOriginalUid,'old');assert.equal(x.a.state.currentTrack.uid,'new');assert.equal(x.a.dom.audio.plays,1);assert(!x.node('replacement-dialog').open);assert([...x.storage.values()].some(v=>v.includes('new')));
 const cancel=boot();cancel.a.state.favorites=[original];const canceled=cancel.a.playTrack(original,{type:'favorites',index:0});await tick();await cancel.node('replacement-close').emit('click');await canceled;assert.equal(cancel.a.state.favorites[0],original);assert.equal(cancel.a.dom.audio.plays,0);
 const race=boot();race.a.state.favorites=[original];const stale=race.a.playTrack(original,{type:'favorites',index:0});await tick();const oldButton=race.node('replacement-list').querySelectorAll('button')[0];await race.a.playTrack({uid:'other',source:'kuwo',title:'Other',artist:'Singer'},{type:'results',index:0});await stale;await oldButton.emit('click');assert.equal(race.a.state.currentTrack.uid,'other');assert.equal(race.a.state.favorites[0],original);
 const empty=boot();empty.c.search=async()=>{};const stop=new AbortController(),nothing=empty.a.chooseDeferredReplacement(original,stop.signal);await tick();assert(empty.node('replacement-status').textContent.includes('未找到'));stop.abort();assert.equal(await nothing,null);
 const manual=boot(),imported={...original,importCheck:undefined,audioUrl:'https://cdn.example/original'};manual.a.state.currentTrack=imported;manual.a.state.favorites=[imported];manual.a.state.playlists=[{id:'manual',tracks:[imported]}];manual.a.state.playContext={type:'playlist',playlistId:'manual',index:0};
 manual.a.renderPlaybackQuality();assert.equal(manual.node('playback-quality').disabled,false,'A single-address song can still search other sources');manual.a.openPlaybackQualityDialog();assert(manual.node('quality-options').children.at(-1).textContent.includes('搜索其他音源'));
 const queried=new Set(),search=manual.c.search;manual.c.search=async(name,k,pool)=>{queried.add(name);return search(name,k,pool);};
 const switching=manual.a.searchCurrentTrackSources();await tick();assert.equal(manual.node('replacement-title').textContent,'搜索其他音源，选择替换版本');assert.equal(queried.size,5);assert.equal(manual.a.state.currentTrack,imported);
 await manual.node('replacement-list').querySelectorAll('button')[0].emit('click');await switching;assert.equal(manual.a.state.currentTrack.uid,'new');assert.equal(manual.a.state.playlists[0].tracks[0].uid,'new');assert.equal(manual.a.state.favorites[0].uid,'new');assert.equal(manual.a.state.playContext.playlistId,'manual');assert.equal(manual.a.state.playContext.index,0);
 const keep=boot();keep.a.state.currentTrack=imported;const keepPending=keep.a.searchCurrentTrackSources();await tick();await keep.node('replacement-close').emit('click');await keepPending;assert.equal(keep.a.state.currentTrack,imported);
 console.log('通过：暂未验证点击后只搜索、用户选择才试播替换并保存、失败/取消/无结果保留、再次选歌取消旧搜索不覆盖播放。');
})().catch(e=>{console.error(e);process.exitCode=1;});
