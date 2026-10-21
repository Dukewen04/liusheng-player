const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const elements=[],nodes=new Map(),handlers={};
function element(){const e={dataset:{},style:{},children:[],handlers:{},value:'',classList:{add(){},toggle(){},remove(){},contains(){return false;}},appendChild(c){this.children.push(c);},addEventListener(k,fn){this.handlers[k]=fn;},click(){this.handlers.click?.({stopPropagation(){}});},showModal(){this.open=true;},close(){this.open=false;},setAttribute(){}};Object.defineProperty(e,'innerHTML',{get(){return this.html||'';},set(v){this.html=v;this.children=[];}});elements.push(e);return e;}
const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,window:{addEventListener(){}},localStorage:{getItem(){return null;},setItem(){}},document:{getElementById:node,createElement:element,activeElement:{tagName:'BODY'},addEventListener(k,fn){handlers[k]=fn;},querySelector:()=>null,querySelectorAll:s=>s==='.track-play-button'?elements.filter(e=>e.className?.includes('track-play-button')):s==='dialog[open]'?[...nodes.values()].filter(e=>e.open):[]}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
 setupDOM();setupEvents();showImportDialog=id=>$(id).showModal();
 playTrack=(track,context)=>{globalThis.chosen={track,context};};
 globalThis.app={state,dom,renderTrackRows,renderPlayQueue,setPlaybackIcon,setCurrent:uid=>loadedTrackUid=uid};
})();`),c);
assert(!html.includes('class="playmode-row"'));assert(html.includes('id="player-status" role="status" aria-live="polite" hidden'));
const playerActions=html.slice(html.indexOf('<div class="player-actions">'),html.indexOf('<div class="player-controls">'));assert(playerActions.includes('id="playmode-toggle"'));
for(const [expected,symbol] of [['list','repeat'],['single','repeat-1'],['shuffle','shuffle']]){node('playmode-toggle').click();assert.equal(c.app.state.playMode,expected);assert(node('playmode-toggle').innerHTML.includes('#icon-'+symbol));assert(node('playmode-toggle').ariaLabel.includes('点击切换'));}

const a=c.app,one={uid:'one',title:'One',artist:'Singer',source:'netease',detailsLoaded:true},two={uid:'two',title:'Two',artist:'Singer',source:'kuwo'};
a.state.currentTrack=one;a.state.isPlaying=true;a.state.playContext={type:'playlist',playlistId:'list',index:0};a.state.playlists=[{id:'list',tracks:[one,two]}];a.state.lyricsMode=true;
const wrap=element();a.renderTrackRows(wrap,[one,two],'playlists');
const first=wrap.children[0].children[2].children[0],second=wrap.children[1].children[2].children[0];
assert(first.innerHTML.includes('#icon-pause'));assert(first.ariaLabel.startsWith('暂停'));assert(second.innerHTML.includes('#icon-play'));
a.dom.audio.currentTime=42;a.dom.audio.src='https://cdn.example/one';a.setCurrent('one');let pauses=0,plays=0;
a.dom.audio.pause=()=>{pauses++;a.state.isPlaying=false;a.setPlaybackIcon(false);};a.dom.audio.play=()=>{plays++;a.state.isPlaying=true;a.setPlaybackIcon(true);return Promise.resolve();};
first.click();assert.equal(pauses,1);assert(first.innerHTML.includes('#icon-play'));assert.equal(a.dom.audio.currentTime,42);assert.equal(c.chosen,undefined);
first.click();assert.equal(plays,1);assert(first.innerHTML.includes('#icon-pause'));assert.equal(a.dom.audio.currentTime,42);
node('play-queue-btn').click();assert(node('play-queue-dialog').open);assert.equal(node('play-queue-count').textContent,'共 2 首');assert.equal(node('play-queue-list').children.length,2);
const queueSecond=node('play-queue-list').children[1].children[2].children[0];queueSecond.click();assert.equal(c.chosen.track,two);assert.equal(c.chosen.context.playlistId,'list');assert.equal(c.chosen.context.index,1);assert(a.state.lyricsMode);
handlers.keydown({key:'Escape',target:{}});assert(a.state.lyricsMode,'Esc in a native dialog must not exit pure mode');node('play-queue-close').click();assert(!node('play-queue-dialog').open);assert(a.state.lyricsMode);
a.state.playContext={type:'favorites',index:0};a.state.favorites=[];a.renderPlayQueue();assert.equal(node('play-queue-count').textContent,'共 0 首');assert(node('play-queue-list').children[0].textContent.includes('为空'));
assert(html.includes('.lyrics-mode #play-queue-btn{display:inline-flex}'));
console.log('通过：播放中列表按钮同步暂停/播放、点击当前项不重置进度、纯净模式查看当前播放列表并切歌、关闭和Esc不退出纯净模式、空列表提示。');
