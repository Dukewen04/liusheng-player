const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const nodes=new Map(),storage=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',attrs:{},children:[],classList:{add(){},remove(){}},setAttribute(k,v){this.attrs[k]=v;},appendChild(child){this.children.push(child);},focus(){}});return nodes.get(id);};
const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,
 location:{hostname:'dukewen04.github.io',port:''},document:{getElementById:node,createElement:()=>({}),querySelector:()=>({dataset:{tab:'playlists'}}),addEventListener(){}},
 localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
 renderPlaylistList=()=>{};updateMainFavButton=()=>{};showToast=text=>globalThis.toast=text;
 dom.playlistInfo=$('playlist-info');dom.playlistSelect=$('playlist-select');dom.playlistModal=$('playlist-modal');dom.playlistNameInput=$('playlist-name-input');
 globalThis.app={state,dom,openPlaylistModal,closePlaylistModal,createPlaylist,importPlaylistData,readPlaylistLinkData,playlistLinkInfo,restoreImportedPlaylistNames,loadLibraryFromStorage};
})();`),c);
const a=c.app,track={uid:'qq-abc',songid:'abc',source:'qq',title:'Song',artist:'Singer'};
const tracks=[track],playlist={id:'qq-playlist-123',name:'Old name',tracks};
a.state.playlists=[playlist];a.state.favorites=[track];a.state.currentTrack=track;a.state.isPlaying=true;a.state.playContext={type:'playlist',index:0,playlistId:playlist.id};a.dom.playlistSelect.value=playlist.id;
(async()=>{
 const playback=JSON.stringify(a.state.playContext);a.openPlaylistModal(playlist.id);assert.equal(a.dom.playlistNameInput.value,'Old name');assert.equal(node('playlist-modal-title').textContent,'重命名歌单');
 a.dom.playlistNameInput.value=' New name ';a.createPlaylist();assert.equal(playlist.name,'New name');assert.equal(playlist.tracks,tracks);assert.equal(a.state.currentTrack,track);assert(a.state.isPlaying);assert.equal(JSON.stringify(a.state.playContext),playback);assert.equal(a.dom.playlistSelect.value,playlist.id);assert.equal(JSON.parse(storage.get('liusheng-library-v1')).playlists[0].name,'New name');
 a.openPlaylistModal(playlist.id);a.dom.playlistNameInput.value=' ';a.createPlaylist();assert.equal(playlist.name,'New name');assert(c.toast.includes('请输入'));a.closePlaylistModal();assert.equal(playlist.name,'New name');
 a.importPlaylistData({favorites:[],playlists:[{...playlist,name:'Original platform name',tracks:[track]}]});assert.equal(playlist.name,'New name','Reimporting a stable playlist ID preserves a user rename');
 a.openPlaylistModal(playlist.id);a.state.playlists=[];a.dom.playlistNameInput.value='Deleted';a.createPlaylist();assert.equal(a.state.playlists.length,0,'Renaming a deleted playlist cannot recreate it');
 a.openPlaylistModal();assert.equal(node('playlist-modal-title').textContent,'新建歌单');a.dom.playlistNameInput.value='New list';a.createPlaylist();assert.equal(a.state.playlists[0].name,'New list');
 const info=a.playlistLinkInfo('https://i2.y.qq.com/n3/other/pages/details/playlist.html?id=123&hosteuin=private');
 const row={name:'Song',artist:'Singer',url:'https://api.qijieya.cn/meting/?server=tencent&type=url&id=abc'};const calls=[];
 c.fetch=async url=>{const u=new URL(url);calls.push(u);return {ok:true,json:async()=>u.searchParams.get('meta')==='1'?{name:'我喜欢'}:[row]};};
 const data=await a.readPlaylistLinkData(info,new AbortController().signal);assert.equal(data.playlists[0].name,'我喜欢');assert.equal(calls.length,2);assert(!calls[0].href.includes('private'),'Account parameters never reach the name service');assert.equal(data.playlists[0].tracks.length,1);
 c.fetch=async url=>new URL(url).searchParams.get('meta')==='1'?{ok:false}:{ok:true,json:async()=>[row]};
 const fallback=await a.readPlaylistLinkData(info,new AbortController().signal);assert.equal(fallback.playlists[0].name,'QQ 歌单 123');assert(!/\d{4}-\d{2}-\d{2}/.test(fallback.playlists[0].name));
 const legacy={id:'qq-playlist-123',name:'QQ 歌单 123',tracks:[track]};a.state.playlists=[legacy];a.dom.playlistSelect.value=legacy.id;
 a.importPlaylistData({favorites:[],playlists:[{id:legacy.id,name:'我喜欢',tracks:[track]}]});assert.equal(legacy.name,'我喜欢','A same-ID import must repair an old generated name');assert.equal(legacy.tracks.length,1);
 a.openPlaylistModal(legacy.id);a.dom.playlistNameInput.value='QQ 歌单 123';a.createPlaylist();assert(legacy.nameEdited);
 a.importPlaylistData({favorites:[],playlists:[{id:legacy.id,name:'我喜欢',tracks:[track]}]});assert.equal(legacy.name,'QQ 歌单 123','Even a default-looking manual rename remains protected');a.loadLibraryFromStorage();assert(a.state.playlists[0].nameEdited,'Manual-name protection survives reload');
 const manualExport={id:'qq-playlist-123',name:'QQ 歌单 123',tracks:[track]};a.state.playlists=[manualExport];a.importPlaylistData({favorites:[],playlists:[{...manualExport,nameEdited:true}]});assert(manualExport.nameEdited,'Importing an exported manual name protects an existing placeholder too');
 const unnamed={id:'qq-playlist-123',name:'QQ 歌单 123',tracks:[track]};a.state.playlists=[unnamed];a.dom.playlistSelect.value=unnamed.id;
 c.fetch=async()=>({ok:true,json:async()=>({name:'我喜欢'})});const current=a.state.currentTrack;
 await a.restoreImportedPlaylistNames();assert.equal(unnamed.name,'我喜欢');assert.equal(a.state.currentTrack,current);assert.equal(a.dom.playlistSelect.value,unnamed.id);assert.equal(JSON.parse(storage.get('liusheng-library-v1')).playlists[0].name,'我喜欢','Refresh-time correction is persisted without reimporting songs');
 let release;const waiting={id:'qq-playlist-123',name:'QQ 歌单 123',tracks:[track]};a.state.playlists=[waiting];
 c.fetch=()=>new Promise(resolve=>{release=resolve;});const pending=a.restoreImportedPlaylistNames();waiting.name='Changed while loading';waiting.nameEdited=true;release({ok:true,json:async()=>({name:'我喜欢'})});await pending;assert.equal(waiting.name,'Changed while loading');
 a.state.playlists=[{id:'qq-playlist-123',name:'QQ 歌单 123',tracks:[track]}];const deleted=a.restoreImportedPlaylistNames();a.state.playlists=[];release({ok:true,json:async()=>({name:'我喜欢'})});await deleted;assert.equal(a.state.playlists.length,0);
 const shared=a.playlistLinkInfo('分享歌单:《我喜欢》 https://i2.y.qq.com/n3/other/pages/details/playlist.html?id=123');assert.equal(shared.name,'我喜欢');assert.equal(a.playlistLinkInfo('https://y.qq.com/n/ryqq/playlist/123?title='+encodeURIComponent('我喜欢')).name,'我喜欢');
 let metadataCalls=0;c.fetch=async url=>{if(new URL(url).searchParams.has('meta')){metadataCalls++;throw Error('Name service offline');}return {ok:true,json:async()=>[row]};};
 const sharedData=await a.readPlaylistLinkData(shared,new AbortController().signal);assert.equal(sharedData.playlists[0].name,'我喜欢');assert.equal(metadataCalls,0,'A provided share title needs no extra metadata request');
 assert(html.includes('appearance:none;-webkit-appearance:none'));assert(html.includes('aria-label="选择歌单"'));assert(html.includes('@media(forced-colors:active)'));
 console.log('通过：歌单重命名保存、空名称/取消/已删除保护、歌曲和播放上下文保留、重复导入保留用户改名、新建复用弹窗、链接原名读取及无日期兜底、旧默认名称重导入/刷新补正、手动名称持久保护及竞态保护、分享标题直接使用、下拉框系统菜单与高对比度支持。');
})().catch(error=>{console.error(error);process.exitCode=1;});
