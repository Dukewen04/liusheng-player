const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const html = fs.readFileSync(require('path').join(__dirname,'../index.html'), 'utf8');
let script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
script = script.replace(/\}\)\(\);\s*$/, `
renderPlaylistOptions=()=>{}; renderPlaylistList=()=>{}; updateMainFavButton=()=>{};
ensureTrackDetails=async track=>{track.audioUrl="test";};
globalThis.app={state,dom,getFilteredFavorites,getSortedFavorites,getActiveList,saveLibraryToStorage,loadLibraryFromStorage,sameRecording,probeRecording,searchNetease,searchQQ,searchKuwo};
})();`);
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {value:'',textContent:'',disabled:false,checked:false});
  return elements.get(id);
};
const storage = new Map();
const tabs = ['results','favorites','playlists'].map(tab=>({dataset:{tab},classList:{toggle(){}}}));
const context = vm.createContext({console, URL, URLSearchParams, document:{
  addEventListener(){}, getElementById:element, querySelectorAll:()=>tabs
}, localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)}});
vm.runInContext(script, context);
context.app.dom.playlistSelect = element('playlist-select');


(async()=>{
const app=context.app;
assert(app.sameRecording({title:'ＨＥＬＬＯ',artist:'A / B'},{title:'hello',artist:'B,A'}));
assert(app.sameRecording({title:'IF YOU',artist:'BIGBANG (빅뱅)'},{title:'If You',artist:'BIGBANG'}));
assert(!app.sameRecording({title:'晴天',artist:'周杰伦'},{title:'晴天 (Live)',artist:'周杰伦'}));
assert(!app.sameRecording({title:'晴天',artist:'周杰伦'},{title:'晴天',artist:'其他歌手'}));
context.setTimeout=setTimeout;context.clearTimeout=clearTimeout;

context.Audio=class {
  constructor(){this.duration=180;this.currentTime=0;this.seeking=false;}
  play(){this.onloadedmetadata();this.currentTime=1.1;this.ontimeupdate();assert.equal(this.currentTime,90);this.currentTime=90.8;this.ontimeupdate();return Promise.resolve();}
  pause(){} removeAttribute(){} load(){}
};
const track={uid:'test',title:'晴天',artist:'周杰伦'};
assert.equal((await app.probeRecording(track)).uid,'test');
context.Audio=class {constructor(){this.duration=30;}play(){this.onloadedmetadata();return Promise.resolve();}pause(){}removeAttribute(){}load(){}};
await assert.rejects(app.probeRecording(track),/试听/);
context.AbortSignal=AbortSignal; context.location={hostname:"127.0.0.1",port:"8766"};
context.fetch=async url=>({ok:true,json:async()=>url.includes('meting') ? [{name:'晴天',artist:'周杰伦',url:'https://test/?id=123'}] : url.includes('/api/qq') ? [{song_mid:'abc',song_title:'晴天',singer_name:'周杰伦'}] : {data:[{rid:'456',song:'晴天',singer:'周杰伦'}]}});
const pools=[{searchResults:[],trackMap:new Map()},{searchResults:[],trackMap:new Map()}];
await Promise.all(pools.map(async pool=>{await Promise.all([app.searchNetease('晴天',1,30,pool),app.searchQQ('晴天',30,pool),app.searchKuwo('晴天',30,pool)]);}));
assert.equal(pools[0].searchResults.length,3);assert.equal(pools[1].searchResults.length,3);assert.equal(app.state.searchResults.length,0);
console.log('通过：独立搜索结果不串歌。');
console.log('通过：歌名歌手和版本匹配、首段及中段实际播放进度、短试听拒绝。');
})().catch(e=>{console.error(e);process.exitCode=1;});
