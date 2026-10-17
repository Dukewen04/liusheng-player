const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const html = fs.readFileSync(require('path').join(__dirname,'../index.html'), 'utf8');
let script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
script = script.replace(/\}\)\(\);\s*$/, `
renderPlaylistOptions=()=>{}; renderPlaylistList=()=>{}; updateMainFavButton=()=>{};
playTrack=(track,context,time)=>globalThis.resumed={track,context,time};
globalThis.app={state,dom,savePlaybackState,restorePlaybackState,setLoadedUid:uid=>loadedTrackUid=uid};
})();`);
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {value:'',textContent:'',disabled:false,checked:false});
  return elements.get(id);
};
const storage = new Map();
const tabs = ['results','favorites','playlists'].map(tab=>({dataset:{tab},classList:{toggle(){}}}));
const context = vm.createContext({console, URLSearchParams, document:{
  addEventListener(){}, getElementById:element, querySelector:()=>({dataset:{tab:'playlists'}}), querySelectorAll:()=>tabs
}, localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)}});
vm.runInContext(script, context);
context.app.dom.playlistSelect = element('playlist-select');

assert.equal(context.app.state.playMode,'shuffle');
const track={uid:'qq-test',source:'qq',songid:'mid',title:'Test',artist:'A'};
context.app.state.playlists=[{id:'pl-test',name:'Test',tracks:[track]}];context.app.state.trackMap.set(track.uid,track);
context.app.dom.playlistSelect.value='pl-test';context.app.dom.volumeSlider={value:'0.8'};
context.app.dom.audio={volume:0.6,currentTime:37.5};
context.app.state.currentTrack=track;context.app.setLoadedUid(track.uid);context.app.state.playMode='single';
context.app.state.playContext={type:'playlist',index:0,playlistId:'pl-test'};
context.app.savePlaybackState();
context.app.state.playMode='shuffle';context.app.state.currentTrack=null;context.app.dom.playlistSelect.value='';context.app.dom.audio.volume=0.8;
context.app.restorePlaybackState();
assert.equal(context.app.state.playMode,'single');assert.equal(context.app.dom.audio.volume,0.6);
assert.equal(context.app.dom.playlistSelect.value,'pl-test');assert.equal(context.resumed.time,37.5);assert.equal(context.resumed.track.uid,'qq-test');
assert.equal(context.resumed.context.index,0);
storage.set('pikachu-music-playback-v1','broken json');context.app.restorePlaybackState();
console.log('通过：默认随机、模式/歌单/歌曲/音量恢复、37.5秒断点续播、损坏存储保护。');
