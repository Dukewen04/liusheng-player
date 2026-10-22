const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const make=()=>({dataset:{},children:[],listeners:{},style:{},textContent:'',appendChild(n){this.children.push(n);},addEventListener(k,f){this.listeners[k]=f;},set innerHTML(v){this.children=[];}});
const storage=new Map(),c=vm.createContext({console,URLSearchParams,AbortController,AbortSignal,setTimeout,clearTimeout,document:{addEventListener(){},createElement:make,getElementById:make},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
showToast=msg=>globalThis.toast=msg;
refreshTrackLyrics=async(track,request,signal)=>{globalThis.calls++;track.lyricsLoading=true;renderLyrics();await globalThis.lookup(track,signal);track.lyricsLoading=false;if(request===playbackRequest&&state.currentTrack===track){state.lyricLines=parseLRC(track.lrc);renderLyrics();}};
globalThis.app={state,dom,addCurrentLyrics,renderLyrics,next:()=>playbackRequest++};})();`),c);
c.calls=0;const a=c.app,track={uid:'netease-test',title:'Song',artist:'Singer',lrc:null};a.state.currentTrack=track;a.dom.audio={currentTime:42,paused:false,src:'keep-audio'};a.dom.lyricsInner=make();a.dom.lyricsContainer={scrollTop:0};
(async()=>{
 a.renderLyrics();const button=a.dom.lyricsInner.children.at(-1).children[0];assert.equal(button.textContent,'一键添加歌词');assert(!button.disabled);
 a.state.favorites=[{...track}];a.state.playlists=[{tracks:[{...track}]}];let release;c.lookup=()=>new Promise(resolve=>release=resolve);const pending=button.listeners.click();assert(a.dom.lyricsInner.children.at(-1).children[0].disabled);await a.addCurrentLyrics();assert.equal(c.calls,1,'No duplicate lookup');track.lrc='[00:01]New lyric';track.lyricSource='网易云';release();await pending;
 assert.equal(a.state.lyricLines[0].text,'New lyric');assert.equal(a.state.favorites[0].lrc,track.lrc);assert.equal(a.state.playlists[0].tracks[0].lrc,track.lrc);assert(storage.get('liusheng-lyrics-v1').includes('New lyric'));assert.equal(a.dom.audio.currentTime,42);assert.equal(a.dom.audio.src,'keep-audio');assert(!a.dom.audio.paused);assert.equal(c.toast,'歌词已添加并保存');await a.addCurrentLyrics();assert.equal(c.calls,1);
 track.lrc=null;a.state.lyricLines=[];c.lookup=async()=>{};await a.addCurrentLyrics();assert(c.toast.includes('未找到'));assert(!a.dom.lyricsInner.children.at(-1).children[0].disabled);
 c.lookup=()=>new Promise(resolve=>release=resolve);const stale=a.addCurrentLyrics();a.state.currentTrack={uid:'new'};a.next();a.state.lyricLines=[{time:0,text:'Keep new song'}];release();await stale;assert.equal(a.state.lyricLines[0].text,'Keep new song');
 a.state.currentTrack=null;a.state.lyricLines=[];a.renderLyrics();assert.equal(a.dom.lyricsInner.children.length,2,'No add button until a song is selected');
 console.log('通过：无歌词添加入口、查找期间禁用及防重复、成功显示和缓存、收藏及歌单同步、无结果可重试、切歌不覆盖、播放保持。');
})().catch(e=>{console.error(e);process.exitCode=1;});
