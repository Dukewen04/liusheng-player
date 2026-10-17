const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const html = fs.readFileSync(require('path').join(__dirname,'../index.html'), 'utf8');
let script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
script = script.replace(/\}\)\(\);\s*$/, `
renderPlaylistOptions=()=>{}; renderPlaylistList=()=>{}; updateMainFavButton=()=>{};
globalThis.app={state,dom,getFilteredFavorites,getSortedFavorites,getActiveList,saveLibraryToStorage,loadLibraryFromStorage};
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

const app=context.app;
app.state.favorites=[
{uid:'one',title:'晴天',artist:'周杰伦',album:'叶惠美'},
{uid:'two',title:'夜曲',artist:'周杰伦',album:'十一月的萧邦'},
{uid:'three',title:'HELLO',artist:'Adele',album:'25'}];
for(const [query,expected] of [['晴天','one'],['周杰伦',['one','two']],['萧邦','two'],['hello adele','three'],['ＨＥＬＬＯ','three'],['找不到',[]],['',['one','two','three']]]){
app.state.favoriteSearch=query;
assert.deepEqual(Array.from(app.getFilteredFavorites(),t=>t.uid),Array.isArray(expected)?expected:[expected]);}
app.state.playContext.type='favorites';app.state.favoriteSearch='夜曲';
assert.equal(app.getActiveList()[1].uid,'two');assert.equal(app.state.favorites.length,3);
console.log('通过：歌名/歌手/专辑、多关键词、大小写和全半角、无匹配、清空恢复；收藏及播放索引不受筛选影响。');

app.state.favoriteSearch='';
app.state.favorites[0].title='Song 10'; app.state.favorites[1].title='Song 2'; app.state.favorites[2].title='Alpha';
app.state.favorites[0].artist='Zed'; app.state.favorites[1].artist='Zed';
for(const [sort,expected] of [['title-asc',['three','two','one']],['title-desc',['one','two','three']],['artist-asc',['three','one','two']],['artist-desc',['one','two','three']],['original',['one','two','three']]]){
  app.state.favoriteSort=sort;
  assert.deepEqual(Array.from(app.getSortedFavorites(),t=>t.uid),expected);
  assert.deepEqual(Array.from(app.getActiveList(),t=>t.uid),expected);
}
app.state.favoriteSort='title-asc'; app.state.favoriteSearch='Zed';
assert.deepEqual(Array.from(app.getFilteredFavorites(),t=>t.uid),['two','one']);
assert.deepEqual(Array.from(app.state.favorites,t=>t.uid),['one','two','three']);
app.saveLibraryToStorage(); app.state.favoriteSort='original'; app.loadLibraryFromStorage();
assert.equal(app.state.favoriteSort,'title-asc');
console.log('通过：歌名和歌手升降序、原始顺序、搜索与排序组合、播放列表顺序及排序选择保存。');
