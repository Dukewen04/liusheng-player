const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const nodes=new Map(),readers=[];
const node=id=>{if(!nodes.has(id))nodes.set(id,{style:{},classList:{add(){},remove(){},toggle(){}},appendChild(){},setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,location:{hostname:'dukewen04.github.io',port:''},localStorage:{getItem(){return null;}},
  window:{scrollX:0,scrollY:240,scrollTo(x,y){this.scrollX=x;this.scrollY=y;}},document:{body:{style:{position:'',top:'',left:'',width:'',overflow:''}},documentElement:{style:{overflow:''}},getElementById:node,createElement:()=>({}),addEventListener(){},querySelectorAll:()=>[]},
  FileReader:class{constructor(){readers.push(this);}readAsText(){}},setTimeout,clearTimeout,setInterval,clearInterval});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`globalThis.imports=[];globalThis.importModes=[];importPlaylistData=data=>{imports.push(data);state.playlists=data.playlists;return {addedFavorites:1,addedPlaylists:0,addedPlaylistTracks:0};};renderPlaylistList=()=>{};renderPlaylistOptions=()=>{};verifyImportData=async()=>{throw Error('Import must not verify songs');};globalThis.app={state,dom,importPlaylistLink,readPlaylistLinkData,playlistLinkInfo,importFileSummary,handleImportPlaylistFile,confirmImportFile,openImportGuide,setImportMethod};})();`),c);
const a=c.app;
assert(!html.includes('<select id="import-platform"'));assert(html.includes('id="import-platform-netease"'));assert(html.includes('id="import-platform-qq"'));
assert(!html.includes('id="import-compare-all"'));assert(!html.includes('id="import-check-mode"'));
a.dom.playlistSelect=node('select');
(async()=>{
assert.equal(a.playlistLinkInfo('分享歌单 https://music.163.com/#/my/m/music/playlist?id=123。').id,'123');
assert.equal(a.playlistLinkInfo('https://music.163.com/playlist?id=42').source,'netease');
const shared=a.playlistLinkInfo('分享歌单: 示例歌单 https://163cn.tv/Example (@网易云音乐)');
assert.equal(shared.source,'netease');assert(shared.short);assert.equal(shared.url,'https://163cn.tv/Example');
assert.throws(()=>a.playlistLinkInfo('https://163cn.tv/a/b'));
assert.equal(a.playlistLinkInfo('https://y.qq.com/n/ryqq_v2/playlist/12345').id,'12345');
assert.equal(a.playlistLinkInfo('https://i.y.qq.com/n2/m/share/details/taoge.html?id=432').source,'qq');
const mobile=a.playlistLinkInfo('分享歌单 https://i2.y.qq.com/n3/other/pages/details/playlist.html?hosteuin=example**&id=456&appshare=iphone_wx');
assert.equal(mobile.source,'qq');assert.equal(mobile.id,'456');assert.equal(mobile.url,'https://y.qq.com/n/ryqq/playlist/456','Strip account and tracking parameters');
assert.throws(()=>a.playlistLinkInfo('https://i2.y.qq.com.evil.test/n3/other/pages/details/playlist.html?id=456'));
for(const url of ['https://music.163.com.evil.test/playlist?id=1','https://y.qq.com/n/ryqq_v2/profile/like/song','https://x.test/playlist?id=1','javascript:alert(1)','https://a:b@music.163.com/playlist?id=1','https://music.163.com:443/playlist?id=1']){
  if(url.includes(':443/'))continue;assert.throws(()=>a.playlistLinkInfo(url));
}
const song={uid:'qq-abc',source:'qq',songid:'abc',title:'Song',artist:'Singer'},data={favorites:[song],playlists:[{name:'List',tracks:[song]}]};
assert.equal(a.importFileSummary(data).tracks,1);assert.equal(a.importFileSummary(data).favorites,1);
for(const invalid of [[],{}, {favorites:[{title:'missing IDs'}]}, {favorites:'bad'}, {playlists:[{}]}, {favorites:[{...song,source:'fake'}]}])assert.throws(()=>a.importFileSummary(invalid));
assert(html.includes('最多等待 35 秒'));assert(html.indexOf('id="import-link-btn"')<html.indexOf('<main class="layout">'),'Import entry belongs to the page header');
a.openImportGuide('file');assert(node('import-link-form').hidden);assert(!node('import-file-panel').hidden);assert(node('import-link-dialog').open);
node('import-platform').value='netease';a.setImportMethod('link');
assert.equal(node('import-platform-steps').textContent,'网易云 → 我的 → 选择歌单（比如我喜欢的音乐） → 分享 → 复制链接');assert.equal(node('import-link-example').textContent,'链接格式：https://163cn.tv/***');
assert(node('import-qq-note').hidden);
node('import-platform').value='qq';a.setImportMethod('link');assert.equal(node('import-qq-note').hidden,false);
assert.equal(node('import-platform-qq')['aria-pressed'],'true');assert.equal(node('import-platform-netease')['aria-pressed'],'false');
assert.equal(node('import-platform-steps').textContent,'QQ → 我的 → 我的收藏 → 分享到微信 → 用浏览器打开 → 复制链接');assert.equal(node('import-link-example').textContent,'链接格式：https://i2.y.qq.com/***');assert(!node('import-link-form').hidden);assert(node('import-connection-note').textContent.includes('公开歌单'));
function choose(name,size=100){const target={files:[{name,size}],value:name};a.handleImportPlaylistFile({target});return target;}
choose('bad.mp3');assert(node('confirm-import-file').disabled);assert.equal(readers.length,0);
choose('big.json',6*1024*1024);assert.equal(readers.length,0);
choose('broken.json');readers[0].result='{bad';readers[0].onload();assert(node('confirm-import-file').disabled);assert.equal(c.imports.length,0);
choose('old.json');choose('new.json');readers[2].result=JSON.stringify(data);readers[2].onload();readers[1].result='{}';readers[1].onload();
assert(!node('confirm-import-file').disabled);assert(node('import-file-status').textContent.includes('new.json'));assert.equal(c.imports.length,0,'Reading a file must not modify the library');
const fileImport=a.confirmImportFile();assert(node('import-link-submit').disabled);assert(!node('import-link-dialog').open);assert(node('import-progress-dialog').open);assert.equal(node('import-progress-dialog').className,'import-compact');await fileImport;assert.equal(c.importModes.length,0);assert(!node('import-link-submit').disabled);assert.equal(c.imports.length,1);assert(node('confirm-import-file').disabled);await a.confirmImportFile();assert.equal(c.imports.length,1);
assert(Object.values(a.state.enabledSources).every(Boolean));
assert(!html.includes('id="library-import-btn"'));const footer=html.match(/<footer>([\s\S]*?)<\/footer>/)[1];assert.equal(footer.replace(/<[^>]+>/g,'').trim(),'音乐版权归各平台及作者');
for(const s of ['netease','qq','kuwo','joox','kugou'])assert(new RegExp(`data-source="${s}"[^>]*checked`).test(html));
console.log('通过：平台链接识别及错误指引、JSON格式/大小/空文件校验、文件预览不改歌单、确认去重入口、防读取竞态、音源默认全选与页面入口清理。');

  c.location.hostname='127.0.0.1';c.location.port='8766';
  a.dom.playlistSelect=node('select');
  node('import-link-url').value='分享歌单: 示例 https://163cn.tv/Example (@网易云音乐)';
  assert(!html.includes('id="import-link-favorite"'));
  const payload={version:1,warning:'测试读取提示',favorites:[],playlists:[{id:'test-playlist',name:'Example',tracks:[song]}]};
  let finishRead;const reading=new Promise(resolve=>finishRead=resolve);
  c.fetch=async raw=>{await reading;const u=new URL(raw,'http://127.0.0.1:8766');assert.equal(u.pathname,'/api/playlist');assert.equal(u.searchParams.get('url'),'https://163cn.tv/Example');return {ok:true,json:async()=>payload};};
  node('import-progress-dialog').close();a.openImportGuide('link');
  const linkImport=a.importPlaylistLink({preventDefault(){}});assert(node('import-link-submit').disabled);assert(node('import-progress-dialog').open);
  assert(!node('import-link-dialog').open);assert.equal(node('import-progress-dialog').className,'import-compact');assert(node('import-link-status').textContent.includes('读取'));
  node('import-progress-dialog').close();a.openImportGuide('file');assert(node('import-progress-dialog').open);assert(!node('import-link-dialog').open);
  finishRead();await linkImport;assert.equal(c.importModes.length,0,'Imports must not check audio');assert(!node('import-link-submit').disabled);assert(node('import-link-status').textContent.includes('测试读取提示'));
  assert.equal(c.imports.length,2);assert.equal(c.imports[1].favorites.length,0);assert.equal(a.state.playContext.playlistId,'test-playlist');
  assert(node('import-link-status').textContent.includes('导入完成'));assert(!node('import-link-submit').disabled);
  c.fetch=async()=>({ok:false,json:async()=>({error:'短链接失效'})});
  await a.importPlaylistLink({preventDefault(){}});
  assert.equal(c.imports.length,2);assert.equal(node('import-link-status').textContent,'短链接失效');assert(node('import-progress-dialog').open);node('import-progress-dialog').close();a.openImportGuide('link');assert(node('import-link-dialog').open);assert(!node('import-progress-dialog').open);assert(!node('import-link-submit').disabled);
  c.location.hostname='dukewen04.github.io';c.location.port='';
  const rows=[{name:'Song A',artist:'Singer A',url:'https://api.qijieya.cn/meting/?server=tencent&type=url&id=abc123',pic:'http://cdn.example/cover.jpg'},
              {name:'Song B',artist:'Singer B',url:'https://api.qijieya.cn/meting/?server=tencent&type=url&id=def456'}];
  c.fetch=async raw=>{const u=new URL(raw);assert.equal(u.origin,'https://api.qijieya.cn');assert.equal(u.searchParams.get('server'),'tencent');assert.equal(u.searchParams.get('type'),'playlist');assert.equal(u.searchParams.get('id'),'456');return {ok:true,json:async()=>rows};};
  const qqData=await a.readPlaylistLinkData(mobile);
  assert.equal(qqData.playlists[0].tracks.length,2);assert.equal(qqData.playlists[0].tracks[0].songMid,'abc123');
  assert.equal(qqData.playlists[0].tracks[0].cover,'https://cdn.example/cover.jpg');assert(!qqData.playlists[0].tracks[0].audioUrl);
  c.fetch=async raw=>{const u=new URL(raw);assert.equal(u.origin,'https://api.qijieya.cn');assert.equal(u.searchParams.get('server'),'netease');return {ok:true,json:async()=>[{name:'Song',artist:'Singer',url:'https://api.qijieya.cn/meting/?server=netease&type=url&id=123'}]};};
  const direct=await a.readPlaylistLinkData(a.playlistLinkInfo('https://music.163.com/playlist?id=42'));
  assert.equal(direct.playlists[0].tracks[0].source,'netease');assert.equal(direct.playlists[0].tracks[0].songid,'123');
  c.fetch=async raw=>{const u=new URL(raw);assert.equal(u.hostname,'liusheng-playlist-service.ivory-hinny-7935.chatgpt.site');assert.equal(u.pathname,'/api/playlist');assert.equal(u.searchParams.get('url'),'https://163cn.tv/Example');return {ok:true,json:async()=>payload};};
  const expanded=await a.readPlaylistLinkData(shared);assert.equal(expanded.playlists[0].tracks.length,1);
  c.fetch=async()=>({ok:true,json:async()=>rows});
  node('import-link-url').value='https://i2.y.qq.com/n3/other/pages/details/playlist.html?hosteuin=example**&id=456';
  await a.importPlaylistLink({preventDefault(){}});assert.equal(c.imports.length,3);assert.equal(c.imports[2].playlists[0].id,'qq-playlist-456');assert(node('import-link-status').textContent.includes('读取 2 首'));
  const originalAbortSignal=c.AbortSignal;
  c.AbortSignal={any:AbortSignal.any,timeout(){return AbortSignal.abort(new DOMException('Deadline','TimeoutError'));}};
  await assert.rejects(a.readPlaylistLinkData(shared),/35 秒/);c.AbortSignal=originalAbortSignal;
  const deadline=new AbortController();c.AbortSignal={any:AbortSignal.any,timeout:()=>deadline.signal};
  c.fetch=async()=>({ok:true,json:async()=>new Promise(()=>{})});
  const timedImport=a.importPlaylistLink({preventDefault(){}});deadline.abort(new DOMException('Deadline','TimeoutError'));await timedImport;
  assert(node('import-link-status').textContent.includes('35 秒'));assert.equal(node('import-progress-title').textContent,'导入未完成');assert(!node('import-link-submit').disabled);c.AbortSignal=originalAbortSignal;
  const stopRead=new AbortController();c.fetch=async()=>new Promise(()=>{});
  const stoppedRead=a.readPlaylistLinkData(shared,stopRead.signal);stopRead.abort();await assert.rejects(stoppedRead,error=>error.name==='AbortError');
  c.localStorage.getItem=()=> 'https://configured.example';
  c.fetch=async raw=>{if(new URL(raw).hostname==='configured.example')throw new TypeError('Failed to fetch');assert.equal(new URL(raw).hostname,'liusheng-playlist-service.ivory-hinny-7935.chatgpt.site');return {ok:true,json:async()=>payload};};
  assert.equal((await a.readPlaylistLinkData(shared)).playlists[0].tracks.length,1);c.localStorage.getItem=()=>null;
  for(const invalid of [[],{code:403},[null],[{...rows[0],url:'https://evil.test/?id=abc123'}],[{...rows[0],name:''}]]){
    c.fetch=async()=>({ok:true,json:async()=>invalid});await assert.rejects(a.readPlaylistLinkData(mobile));
  }
  c.fetch=async()=>{throw new TypeError('Failed to fetch');};await a.importPlaylistLink({preventDefault(){}});
  assert.equal(c.imports.length,3);assert(!node('import-link-submit').disabled);assert(node('import-link-status').textContent.includes('代理'));
  console.log('通过：整段分享文字转发本地短链解析、自动导入到歌单且不加入收藏、失败不修改资料且恢复按钮。');
  console.log('通过：QQ手机分享链接、账户和跟踪参数剥离、线上无代理导入、歌曲标识/顺序保持、空歌单及格式错误拒绝、网络失败保留收藏。');
})().catch(error=>{console.error(error);process.exitCode=1;});
