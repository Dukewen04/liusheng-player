const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
function element(){const item={style:{},attrs:{},children:[],handlers:{},setAttribute(k,v){this.attrs[k]=v;},appendChild(child){this.children.push(child);},addEventListener(event,fn){this.handlers[event]=fn;},close(){this.open=false;},showModal(){this.open=true;}};Object.defineProperty(item,'innerHTML',{set(value){this.html=value;this.children=[];},get(){return this.html||'';}});return item;}
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
let loadGate=null,playGate=null,blockNew=false,decodeFail=false,playFail=false,autoPause=false,current=()=>null;
const audios=[];
class Audio{
 constructor(){this.listeners=new Map();this.currentTime=0;this.duration=180;this.readyState=0;this.seeking=false;this.paused=true;this.volume=.6;this.muted=false;this.playbackRate=1;this.src='';this.loads=0;this.pauses=0;audios.push(this);}
 addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,new Set());this.listeners.get(k).add(fn);}
 removeEventListener(k,fn){this.listeners.get(k)?.delete(fn);}
 emit(k){for(const fn of [...(this.listeners.get(k)||[])])fn();this['on'+k]?.();}
 removeAttribute(k){if(k==='src')this.src='';}
 replaceWith(other){this.replacedBy=other;}
 load(){this.loads++;this.currentTime=0;if(!this.src){this.readyState=0;this.emit('emptied');return;}const ready=()=>{if(!this.src)return;if(decodeFail){this.emit('error');return;}this.readyState=4;this.emit('loadedmetadata');this.emit('canplay');this.emit('seeked');};if(loadGate)loadGate.push(ready);else queueMicrotask(ready);}
 pause(){this.pauses++;this.paused=true;this.emit('pause');}
 async play(){if(blockNew&&this!==current())throw Object.assign(Error('Gesture required'),{name:'NotAllowedError'});if(playFail)throw Error('Activation failed');if(playGate)await new Promise(resolve=>playGate.push(resolve));if(autoPause&&this!==current())current().pause();this.paused=false;this.emit('play');}
}
const original=new Audio();original.src='https://audio.test/std.mp3';original.currentTime=42;original.paused=false;
const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,DOMException,Audio,setTimeout,clearTimeout,document:{getElementById:node,createElement:element,addEventListener(){}},localStorage:{getItem(){return null;}}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
 dom.audio=globalThis.audio;dom.trackQualityPill={style:{}};dom.playerStatus={};dom.currentTime={};dom.totalTime={};dom.progressBar={style:{}};dom.progressHandle={style:{}};dom.progressWrapper={clientWidth:200};
 showImportDialog=id=>$(id).showModal();savePlaybackState=()=>{};saveLibraryToStorage=()=>{};renderPlaylistList=()=>{};showToast=text=>globalThis.toast=text;updateMobilePlayback=()=>{};updateLyricsHighlight=time=>globalThis.lyricTime=time;setPlaybackIcon=playing=>globalThis.iconPlaying=playing;playNext=()=>globalThis.nextCount++;handlePlaybackFailure=()=>globalThis.failureCount++;
 ensureTrackDetails=async candidate=>{globalThis.detailsCalls++;candidate.audioOptions=globalThis.options;candidate.audioUrl='https://audio.test/std.mp3';candidate.detailsLoaded=true;candidate.detailsExpiresAt=Date.now()+600000;};
 probeRecording=async()=>{throw Error('Quality switching should preload the target position, not probe and reload');};
 bindPlaybackAudio(dom.audio);
 globalThis.app={state,dom,playbackQualityOptions,switchPlaybackQuality,renderPlaybackQuality,openPlaybackQualityDialog,togglePlayPause,
 changed:()=>{++playbackRequest;qualityController?.abort();state.currentTrack={uid:'another'};}};
})();`),Object.assign(c,{audio:original,detailsCalls:0,nextCount:0,failureCount:0}));
const options=[{preferredAudioQuality:'std',audioUrl:'https://audio.test/std.mp3',qualityLabel:'STD'},{preferredAudioQuality:'flac',audioUrl:'https://audio.test/lossless.flac',qualityLabel:'LOSSLESS',quality:'lossless'}];c.options=options;
const a=c.app,track={uid:'qq-1',source:'qq',title:'Song',artist:'Singer',audioUrl:options[0].audioUrl,audioOptions:options,qualityLabel:'STD'};a.state.currentTrack=track;a.state.favorites=[{...track}];current=()=>a.dom.audio;
const tick=()=>new Promise(setImmediate);
(async()=>{
 assert.equal(a.playbackQualityOptions(track)[0].label,'标准');
 a.openPlaybackQualityDialog();let panel=node('quality-options');assert.equal(panel.children[0].attrs['aria-pressed'],'true');assert.equal(panel.children[0].children[0].children[1].textContent,'正在使用');panel.children[0].handlers.click();assert.equal(track.audioUrl,options[0].audioUrl);
 a.openPlaybackQualityDialog();const stale=panel.children[1];a.state.currentTrack={uid:'another'};stale.handlers.click();assert.equal(track.audioUrl,options[0].audioUrl);a.state.currentTrack=track;
 loadGate=[];const switching=a.switchPlaybackQuality('flac');await tick();assert.equal(a.dom.audio,original);assert(!original.paused);assert.equal(original.loads,0,'Original audio is not reloaded while preparing');assert.equal(node('playback-quality').textContent,'正在切换…');original.currentTime=47;const ready=loadGate.splice(0);loadGate=null;for(const fn of ready)fn();await switching;
 const first=a.dom.audio;assert.notEqual(first,original);assert.equal(first.loads,1,'Use the prepared audio without a second load');assert.equal(first.currentTime,47);assert.equal(first.paused,false);assert.equal(first.volume,.6);assert.equal(first.muted,false);assert.equal(first.playbackRate,1);assert.equal(original.replacedBy,first);assert.equal(track.audioUrl,options[1].audioUrl);assert.equal(a.state.favorites[0].preferredAudioQuality,'flac');
 const before=c.detailsCalls;first.pause();first.currentTime=71;await a.switchPlaybackQuality('std');assert.equal(c.detailsCalls,before,'Reuse unexpired known quality addresses');assert.equal(a.dom.audio.currentTime,71);assert(a.dom.audio.paused,'A paused track stays paused');
 const paused=a.dom.audio;await paused.play();paused.currentTime=75;playFail=true;await a.switchPlaybackQuality('flac');playFail=false;assert.equal(a.dom.audio,paused);assert(!paused.paused,'Activation failure leaves the old version playing');assert.equal(track.audioUrl,options[0].audioUrl);assert(c.toast.includes('保留原音质'));
 decodeFail=true;await a.switchPlaybackQuality('flac');decodeFail=false;assert.equal(a.dom.audio,paused);assert(!paused.paused);assert.equal(track.audioUrl,options[0].audioUrl);
 // If a browser requires the original, user-authorized element, preserve the old fallback path.
 blockNew=true;await a.switchPlaybackQuality('flac');blockNew=false;assert.equal(a.dom.audio,paused);assert.equal(track.audioUrl,options[1].audioUrl);assert.equal(paused.currentTime,75);assert(!paused.paused);
 const main=a.dom.audio;main.currentTime=80;await a.switchPlaybackQuality('std');assert.notEqual(a.dom.audio,main);a.dom.audio.currentTime=81;a.dom.audio.emit('timeupdate');assert.equal(c.lyricTime,81);a.dom.audio.pause();assert.equal(a.state.isPlaying,false);await a.dom.audio.play();assert.equal(a.state.isPlaying,true);const nextBefore=c.nextCount;main.emit('ended');assert.equal(c.nextCount,nextBefore,'Retired audio events cannot skip a track');a.dom.audio.emit('ended');assert.equal(c.nextCount,nextBefore+1,'New audio keeps next-track behavior');
 // A pause made during a pending activation wins over the earlier playing state.
 const beforePause=a.dom.audio;playGate=[];const pendingPause=a.switchPlaybackQuality('flac');await tick();a.togglePlayPause();const plays=playGate.splice(0);playGate=null;for(const fn of plays)fn();await pendingPause;assert(a.dom.audio.paused);
 await a.dom.audio.play();autoPause=true;await a.switchPlaybackQuality('std');autoPause=false;assert(!a.dom.audio.paused,'An automatic mobile audio-session pause must not be mistaken for the user pausing');
 loadGate=[];const old=a.dom.audio;const pending=a.switchPlaybackQuality('flac');await tick();a.changed();const delayed=loadGate.splice(0);loadGate=null;for(const fn of delayed)fn();await pending;assert.equal(a.dom.audio,old,'An aborted old request cannot replace the next song');assert(audios.at(-1).paused);assert.equal(audios.at(-1).src,'');
 a.state.currentTrack=track;await a.dom.audio.play();playGate=[];const pendingActivation=a.switchPlaybackQuality('flac');await tick();const activating=audios.at(-1);a.changed();assert.equal(activating.src,'','Abort releases an activating candidate immediately');const activations=playGate.splice(0);playGate=null;for(const fn of activations)fn();await pendingActivation;assert(activating.paused);
 assert.equal(a.playbackQualityOptions({source:'netease',audioUrl:'https://audio.test/x'}).length,0);
 const versions=a.playbackQualityOptions({source:'kuwo',audioUrl:'https://audio.test/x'});assert.equal(versions[0].label,'默认版本');assert.equal(versions[1].label,'备用版本');assert(versions[1].description.includes('没声音或加载慢'));
 assert(!html.includes("label:'原音质'"));assert(!html.includes("label:'兼容音质'"));
 assert(html.includes('body.lyrics-mode .app{position:fixed;inset:0;'));assert(html.includes('#play-queue-dialog[open]{display:flex;flex-direction:column;overflow:hidden}'));
 console.log('通过：版本说明、目标位置预加载并直接接替、准备时原曲继续播放、避免重复取源/加载、暂停及音量保持、加载和激活失败保留原曲、浏览器授权限制回退、切歌及暂停竞态、接替后播放/进度/下一首事件、纯净模式和列表滚动隔离。');
})().catch(error=>{console.error(error);process.exitCode=1;});
