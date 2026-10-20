const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',style:{},appendChild(){}});return nodes.get(id);};
const listeners=new Map();
const audio={currentTime:42,duration:180,paused:false,src:'https://audio.test/std.mp3',
 addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);},
 load(){this.currentTime=0;const fn=listeners.get('loadedmetadata');listeners.delete('loadedmetadata');fn?.();},
 pause(){this.paused=true;},async play(){this.paused=false;}};
const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,
 document:{getElementById:node,createElement:()=>({}),addEventListener(){}},localStorage:{getItem(){return null;}}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
 dom.audio=globalThis.audio;dom.trackQualityPill={style:{}};
 savePlaybackState=()=>{};saveLibraryToStorage=()=>{};renderPlaylistList=()=>{};showToast=text=>globalThis.toast=text;
 ensureTrackDetails=async candidate=>{candidate.audioOptions=globalThis.options;candidate.audioUrl='https://audio.test/std.mp3';candidate.detailsLoaded=true;candidate.detailsExpiresAt=Date.now()+600000;};
 probeRecording=async candidate=>{if(globalThis.probe)await globalThis.probe(candidate);return candidate;};
 globalThis.app={state,playbackQualityOptions,switchPlaybackQuality,renderPlaybackQuality,
 changed:()=>{++playbackRequest;qualityController?.abort();state.currentTrack={uid:'another'};}};
})();`),Object.assign(c,{audio}));
const options=[{preferredAudioQuality:'std',audioUrl:'https://audio.test/std.mp3',qualityLabel:'STD'},
 {preferredAudioQuality:'flac',audioUrl:'https://audio.test/lossless.flac',qualityLabel:'LOSSLESS',quality:'lossless'}];
c.options=options;
const a=c.app,track={uid:'qq-1',source:'qq',title:'Song',artist:'Singer',audioUrl:options[0].audioUrl,audioOptions:options,qualityLabel:'STD'};
a.state.currentTrack=track;a.state.favorites=[{...track}];
(async()=>{
 await a.switchPlaybackQuality('flac');assert.equal(track.audioUrl,options[1].audioUrl);assert.equal(track.preferredAudioQuality,'flac');assert.equal(audio.currentTime,42);assert.equal(audio.paused,false);assert.equal(a.state.favorites[0].preferredAudioQuality,'flac');
 audio.paused=true;audio.currentTime=71;await a.switchPlaybackQuality('std');assert.equal(audio.currentTime,71);assert(audio.paused,'A paused track stays paused');
 const normalPlay=audio.play;audio.play=async function(){if(this.src.endsWith('.flac'))throw Error('play failed');return normalPlay.call(this);};
 audio.paused=false;await a.switchPlaybackQuality('flac');assert.equal(track.audioUrl,options[0].audioUrl);assert.equal(audio.currentTime,71);assert(!audio.paused,'Failed activation restores old playback');audio.play=normalPlay;
 c.probe=async()=>{throw Error('decode failed');};await a.switchPlaybackQuality('flac');assert.equal(track.audioUrl,options[0].audioUrl);assert.equal(audio.currentTime,71);assert(c.toast.includes('保留原音质'));
 c.options=[options[0]];c.probe=null;await a.switchPlaybackQuality('flac');assert.equal(track.audioUrl,options[0].audioUrl,'An absent tier cannot silently switch to a different tier');
 c.options=options;let release;c.probe=()=>new Promise(resolve=>{release=resolve;});const pending=a.switchPlaybackQuality('flac');await new Promise(setImmediate);a.changed();release();await pending;assert.equal(audio.src,options[0].audioUrl,'An old request cannot replace the next song');
 assert.equal(a.playbackQualityOptions({source:'netease',audioUrl:'https://audio.test/x'}).length,0);
 assert.equal(a.playbackQualityOptions({source:'kuwo',audioUrl:'https://audio.test/x'}).length,2);
 assert.equal(a.playbackQualityOptions({...track,audioOptions:[options[0],options[0]]}).length,1,'Duplicate addresses do not invent extra tiers');
 console.log('通过：音质地址及偏好切换、播放进度和暂停状态保持、失败及缺失档位保留原曲、切歌竞态、单档及重复地址处理。');
})().catch(error=>{console.error(error);process.exitCode=1;});
