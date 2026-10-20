const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const nodes=new Map(),storage=new Map();let tab='favorites',answer=false;const prompts=[];
function element(){const node={dataset:{},style:{},value:'',textContent:'',children:[],handlers:{},classList:{add(){},remove(){},toggle(){}},appendChild(child){this.children.push(child);},addEventListener(event,fn){this.handlers[event]=fn;},setAttribute(){}};Object.defineProperty(node,'innerHTML',{set(value){this.html=value;this.children=[];},get(){return this.html||'';}});return node;}
const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
const c=vm.createContext({console,URL,URLSearchParams,setTimeout,clearTimeout,window:{confirm(message){prompts.push(message);return answer;}},
 localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},document:{addEventListener(){},getElementById:node,createElement:element,querySelector:()=>({dataset:{tab}}),querySelectorAll:()=>[]}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`renderPlaylistOptions=()=>{};renderMiniSearchList=()=>{};updateMainFavButton=()=>{};showToast=()=>{};playFromList=(...args)=>globalThis.played=args;globalThis.app={state,dom,clearFavorites,clearSearchResults,filterTracks,getActiveList,renderPlaylistList};})();`),c);
const a=c.app;for(const name of ['playlistList','playlistSelect','playlistSelectRow','playlistInfo','searchCount','searchStatus'])a.dom[name]=node(name);
const songs=[{uid:'qq-1',source:'qq',title:'晴天',artist:'周杰伦',album:'叶惠美'},{uid:'qq-2',source:'qq',title:'夜曲',artist:'周杰伦',album:'十一月的萧邦'},{uid:'qq-3',source:'qq',title:'HELLO',artist:'Adele',album:'25'}];
a.state.favorites=[...songs];a.state.playlists=[{id:'list',name:'Example',tracks:[...songs]}];a.state.currentTrack=songs[1];a.state.playContext={type:'favorites',index:1};a.state.favoriteSearch='夜曲';
a.clearFavorites();assert.equal(prompts.length,1);assert(prompts[0].includes('3'));assert.equal(a.state.favorites.length,3);assert(!storage.has('liusheng-library-v1'),'Cancel leaves storage unchanged');
answer=true;a.clearFavorites();assert.equal(a.state.favorites.length,0);assert.equal(a.state.favoriteSearch,'');assert.equal(a.state.playlists[0].tracks.length,3);assert.equal(a.state.currentTrack.uid,'qq-2');assert.equal(a.state.playContext.index,-1);assert.equal(JSON.parse(storage.get('liusheng-library-v1')).favorites.length,0);assert(node('clear-favorites-btn').disabled);
a.clearFavorites();assert.equal(prompts.length,2,'Empty favorites do not prompt');
tab='playlists';a.dom.playlistSelect.value='list';a.state.playContext={type:'playlist',index:1,playlistId:'list'};
for(const [query,ids] of [['周杰伦',['qq-1','qq-2']],['萧邦',['qq-2']],['ＨＥＬＬＯ adele',['qq-3']],['找不到',[]],['',['qq-1','qq-2','qq-3']]])assert.deepEqual(Array.from(a.filterTracks(songs,query),t=>t.uid),ids);
a.state.currentTrack=songs[0];a.state.playlistSearch='夜曲';a.renderPlaylistList();assert(node('playlist-search-count').textContent.includes('1 首 / 共 3 首'));assert.equal(a.dom.playlistList.children.length,1);
const row=a.dom.playlistList.children[0];row.children[2].children[0].handlers.click({stopPropagation(){}});assert.deepEqual(Array.from(c.played),['playlist',1,'list'],'Filtered rows play the full playlist index');assert.equal(a.getActiveList().length,3,'Filtering must not change the playback queue');assert.equal(a.state.playlists[0].tracks.length,3);
a.state.playlistSearch='找不到';a.renderPlaylistList();assert(a.dom.playlistList.children[0].innerHTML.includes('没有找到'));
for(const id of ['rebuild-favorites-btn','stop-rebuild-btn','retry-rebuild-btn','export-rebuild-btn','rebuild-status'])assert(!html.includes('id="'+id+'"'));
assert(!source.includes('function rebuildFavorites'));assert(!html.includes('收藏整理工具'));assert(!html.includes('导入歌单文件'));assert(html.includes('clear-favorites-btn'));assert(html.includes('clear-results-btn'));
console.log('通过：清空收藏二次确认/取消/空列表、保存删除且保留歌单与播放、自建歌单多字段搜索、筛选后播放原始索引、无结果提示、移除旧整理工具及导入文案。');
