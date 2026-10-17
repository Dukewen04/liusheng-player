const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const html = fs.readFileSync(require('path').join(__dirname,'../index.html'), 'utf8');
let script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
script = script.replace(/\}\)\(\);\s*$/, `
renderPlaylistOptions=()=>{}; renderPlaylistList=()=>{}; updateMainFavButton=()=>{}; showToast=()=>{};
globalThis.app={state,dom,getFilteredFavorites,getSortedFavorites,getActiveList,saveLibraryToStorage,loadLibraryFromStorage,exportPlaylistData};
})();`);
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {value:'',textContent:'',disabled:false,checked:false});
  return elements.get(id);
};
const storage = new Map();
const tabs = ['results','favorites','playlists'].map(tab=>({dataset:{tab},classList:{toggle(){}}}));
const context = vm.createContext({console, URLSearchParams, document:{
  addEventListener(){}, getElementById:element, querySelectorAll:()=>tabs
}, localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)}});
vm.runInContext(script, context);
context.app.dom.playlistSelect = element('playlist-select');


(async()=>{
const app=context.app;
const blobs=[];const links=[];
context.Blob=Blob;context.URL={createObjectURL:blob=>{blobs.push(blob);return 'blob:test';},revokeObjectURL(){}};
context.document.body={appendChild(){}};
context.document.createElement=()=>({click(){links.push(this.download);},remove(){}});
app.state.favorites=[{uid:'one',title:'晴天',artist:'周杰伦'},{uid:'two',title:'夜曲',artist:'周杰伦'}];
app.state.playlists=[{id:'other',name:'其他歌单',tracks:[{uid:'three',title:'HELLO',artist:'Adele'}]}];
app.state.favoriteSearch='晴天';
app.exportPlaylistData(true);
const favorites=JSON.parse(await blobs[0].text());
assert.equal(favorites.favorites.length,2);assert.equal(favorites.playlists.length,0);
assert.match(links[0],/^liusheng-favorites-/);
app.exportPlaylistData();
assert.equal(JSON.parse(await blobs[1].text()).playlists.length,1);
app.state.favorites=[];app.exportPlaylistData(true);assert.equal(blobs.length,2);
console.log('通过：导出全部收藏（不受搜索筛选影响）、不包含自建歌单、原歌单导出不变、空收藏提示。');
})().catch(e=>{console.error(e);process.exitCode=1;});
