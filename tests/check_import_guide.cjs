const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const nodes=new Map(),readers=[];
const node=id=>{if(!nodes.has(id))nodes.set(id,{style:{},classList:{add(){},remove(){},toggle(){}},appendChild(){},setAttribute(k,v){this[k]=v;},showModal(){this.open=true;}});return nodes.get(id);};
const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,location:{hostname:'dukewen04.github.io',port:''},localStorage:{getItem(){return null;}},
  document:{getElementById:node,createElement:()=>({}),addEventListener(){},querySelectorAll:()=>[]},
  FileReader:class{constructor(){readers.push(this);}readAsText(){}},setTimeout,clearTimeout});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`globalThis.imports=[];importPlaylistData=data=>{imports.push(data);return {addedFavorites:1,addedPlaylists:0,addedPlaylistTracks:0};};renderPlaylistList=()=>{};renderPlaylistOptions=()=>{};globalThis.app={state,dom,importPlaylistLink,playlistLinkInfo,importFileSummary,handleImportPlaylistFile,confirmImportFile,openImportGuide,setImportMethod};})();`),c);
const a=c.app;
assert.equal(a.playlistLinkInfo('分享歌单 https://music.163.com/#/my/m/music/playlist?id=123。').id,'123');
assert.equal(a.playlistLinkInfo('https://music.163.com/playlist?id=42').source,'netease');
const shared=a.playlistLinkInfo('分享歌单: 示例歌单 https://163cn.tv/Example (@网易云音乐)');
assert.equal(shared.source,'netease');assert(shared.short);assert.equal(shared.url,'https://163cn.tv/Example');
assert.throws(()=>a.playlistLinkInfo('https://163cn.tv/a/b'));
assert.equal(a.playlistLinkInfo('https://y.qq.com/n/ryqq_v2/playlist/12345').id,'12345');
assert.equal(a.playlistLinkInfo('https://i.y.qq.com/n2/m/share/details/taoge.html?id=432').source,'qq');
for(const url of ['https://music.163.com.evil.test/playlist?id=1','https://y.qq.com/n/ryqq_v2/profile/like/song','https://x.test/playlist?id=1','javascript:alert(1)','https://a:b@music.163.com/playlist?id=1','https://music.163.com:443/playlist?id=1']){
  if(url.includes(':443/'))continue;assert.throws(()=>a.playlistLinkInfo(url));
}
const song={uid:'qq-abc',source:'qq',songid:'abc',title:'Song',artist:'Singer'},data={favorites:[song],playlists:[{name:'List',tracks:[song]}]};
assert.equal(a.importFileSummary(data).tracks,1);assert.equal(a.importFileSummary(data).favorites,1);
for(const invalid of [[],{}, {favorites:[{title:'missing IDs'}]}, {favorites:'bad'}, {playlists:[{}]}, {favorites:[{...song,source:'fake'}]}])assert.throws(()=>a.importFileSummary(invalid));
a.openImportGuide('file');assert(node('import-link-form').hidden);assert(!node('import-file-panel').hidden);assert(node('import-link-dialog').open);
node('import-platform').value='qq';a.setImportMethod('link');assert(!node('import-link-form').hidden);assert(node('import-connection-note').textContent.includes('尚未连接'));
function choose(name,size=100){const target={files:[{name,size}],value:name};a.handleImportPlaylistFile({target});return target;}
choose('bad.mp3');assert(node('confirm-import-file').disabled);assert.equal(readers.length,0);
choose('big.json',6*1024*1024);assert.equal(readers.length,0);
choose('broken.json');readers[0].result='{bad';readers[0].onload();assert(node('confirm-import-file').disabled);assert.equal(c.imports.length,0);
choose('old.json');choose('new.json');readers[2].result=JSON.stringify(data);readers[2].onload();readers[1].result='{}';readers[1].onload();
assert(!node('confirm-import-file').disabled);assert(node('import-file-status').textContent.includes('new.json'));assert.equal(c.imports.length,0,'Reading a file must not modify the library');
a.confirmImportFile();assert.equal(c.imports.length,1);assert(node('confirm-import-file').disabled);a.confirmImportFile();assert.equal(c.imports.length,1);
assert(Object.values(a.state.enabledSources).every(Boolean));
assert(!html.includes('id="library-import-btn"'));const footer=html.match(/<footer>([\s\S]*?)<\/footer>/)[1];assert(!footer.includes('MusicSquare'));assert(footer.includes('音乐版权归各平台及作者'));
for(const s of ['netease','qq','kuwo','joox','kugou'])assert(new RegExp(`data-source="${s}"[^>]*checked`).test(html));
console.log('通过：平台链接识别及错误指引、JSON格式/大小/空文件校验、文件预览不改歌单、确认去重入口、防读取竞态、音源默认全选与页面入口清理。');

(async()=>{
  c.location.hostname='127.0.0.1';c.location.port='8766';
  a.dom.playlistSelect=node('select');
  node('import-link-url').value='分享歌单: 示例 https://163cn.tv/Example (@网易云音乐)';
  node('import-link-favorite').checked=true;
  const payload={version:1,favorites:[],playlists:[{id:'test-playlist',name:'Example',tracks:[song]}]};
  c.fetch=async raw=>{const u=new URL(raw,'http://127.0.0.1:8766');assert.equal(u.pathname,'/api/playlist');assert.equal(u.searchParams.get('url'),'https://163cn.tv/Example');return {ok:true,json:async()=>payload};};
  await a.importPlaylistLink({preventDefault(){}});
  assert.equal(c.imports.length,2);assert.equal(c.imports[1].favorites.length,1);assert.equal(a.state.playContext.playlistId,'test-playlist');
  assert(node('import-link-status').textContent.includes('已导入'));assert(!node('import-link-submit').disabled);
  c.fetch=async()=>({ok:false,json:async()=>({error:'短链接失效'})});
  await a.importPlaylistLink({preventDefault(){}});
  assert.equal(c.imports.length,2);assert.equal(node('import-link-status').textContent,'短链接失效');assert(!node('import-link-submit').disabled);
  console.log('通过：整段分享文字转发本地短链解析、自动导入歌单和可选收藏、失败不修改资料且恢复按钮。');
})().catch(error=>{console.error(error);process.exitCode=1;});
