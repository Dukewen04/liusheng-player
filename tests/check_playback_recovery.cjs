const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const response=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value});
function boot(fetch){
  const nodes=new Map(),storage=new Map();
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{style:{},dataset:{},value:'',textContent:'',classList:{add(){},remove(){},toggle(){},contains(){return false;}},appendChild(){},addEventListener(){},setAttribute(){}});
    return nodes.get(id);
  };
  const listeners=new Map();
  const audio={src:'https://old.example/old.mp3',currentTime:90,duration:180,volume:0.8,paused:true,error:null,plays:0,
    addEventListener(type,fn,options){const list=listeners.get(type)||[];list.push({fn,once:options?.once});listeners.set(type,list);},
    emit(type){for(const entry of [...listeners.get(type)||[]]){if(entry.once)listeners.set(type,listeners.get(type).filter(item=>item!==entry));entry.fn();}},
    pause(){this.paused=true;this.emit('pause');},removeAttribute(){this.src='';},load(){this.currentTime=0;this.error=null;},
    async play(){this.plays++;this.paused=false;this.emit('loadedmetadata');this.emit('play');}
  };
  nodes.set('audio',audio);
  const context=vm.createContext({URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,fetch,console:{error(){},warn(){}},
    location:{hostname:'dukewen04.github.io',port:''},window:{addEventListener(){}},
    document:{getElementById:node,createElement:()=>node(Symbol()),querySelector:s=>s==='.playlist-tab.active'?{dataset:{tab:'favorites'}}:node(s),querySelectorAll:()=>[],addEventListener(){}},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
  vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
    renderMiniSearchList=()=>{};renderPlaylistList=()=>{};updateMainFavButton=()=>{};renderLyrics=()=>{};updateLyricsHighlight=()=>{};
    refreshTrackLyrics=async()=>{};showToast=value=>globalThis.lastToast=value;
    setupDOM();setupEvents();
    globalThis.app={state,dom,readMusicJSON,mediaUrl,fetchQQDetails,fetchKuwoDetails,ensureTrackDetails,playTrack,togglePlayPause,searchAllSources,getPending:()=>pendingSeek};
  })();`),context);
  return {app:context.app,context,nodes,storage,audio};
}
const rain=()=>({uid:'kuwo-MUSIC_123',source:'kuwo',songid:'MUSIC_123',title:'雨',artist:'沈以诚',keyword:'old query',displayIndex:1});
const songs=[{rid:'MUSIC_999',song:'雨',singer:'别人'},{rid:'MUSIC_123',song:'雨',singer:'沈以诚'}];
const detail={rid:'MUSIC_123',song:'雨',singer:'沈以诚',url:'http://audio.example/rain.flac?sign=a%2Fb&bitrate$2000',format:'flac'};
(async()=>{
  let calls=0;
  const retry=boot(async()=>{if(++calls===1)throw new TypeError('Failed to fetch');return response(['ok']);});
  assert.equal((await retry.app.readMusicJSON('https://api.example/'))[0],'ok');assert.equal(calls,2);
  calls=0;retry.context.fetch=async()=>{calls++;return response({},403);};
  await assert.rejects(retry.app.readMusicJSON('https://api.example/'),error=>error.userMessage.includes('服务'));assert.equal(calls,1,'Never retry an authorization refusal');
  retry.context.fetch=async()=>{throw new TypeError('Failed to fetch');};
  await assert.rejects(retry.app.readMusicJSON('https://api.example/'),error=>error.userMessage.includes('代理'));
  assert.equal(retry.app.mediaUrl(detail.url),'https://audio.example/rain.flac?sign=a%2Fb&bitrate$2000');
  assert.equal(retry.app.mediaUrl('javascript:alert(1)'),null);assert.equal(retry.app.mediaUrl('https://user:pass@host/song'),null);

  const requests=[];
  const kuwo=boot(async url=>{
    const query=new URL(url).searchParams;requests.push(query);
    if(!query.has('n'))return response({data:songs});
    assert.equal(query.get('n'),'2','Use the current matching ID index, not the saved index');
    assert.equal(query.get('msg'),'雨 沈以诚');return response({data:detail});
  });
  const track=rain();await kuwo.app.ensureTrackDetails(track);assert.equal(track.title,'雨');assert.equal(track.artist,'沈以诚');assert(track.audioUrl.startsWith('https://'));assert(track.detailsExpiresAt>Date.now());
  const before=requests.length;await kuwo.app.ensureTrackDetails(track);assert.equal(requests.length,before,'Reuse only a fresh URL');
  track.detailsExpiresAt=0;await kuwo.app.ensureTrackDetails(track);assert(requests.length>before,'Refresh expired addresses');
  kuwo.context.fetch=async url=>response({data:new URL(url).searchParams.has('n')?{...detail,rid:'MUSIC_999'}:songs});
  await assert.rejects(kuwo.app.fetchKuwoDetails(rain()),error=>error.userMessage.includes('不一致'));

  const qqTrack=()=>({uid:'qq-abc',source:'qq',songid:'abc',title:'雨',artist:'沈以诚'});
  const qq=boot(async()=>response({song_mid:'abc',song_title:'雨',singer_name:'沈以诚',song_play_url:null}));
  await assert.rejects(qq.app.fetchQQDetails(qqTrack()),error=>error.userMessage.includes('未返回播放地址'));
  qq.context.fetch=async()=>response({song_mid:'wrong',song_title:'雨',singer_name:'沈以诚',song_play_url:'https://example/audio'});
  await assert.rejects(qq.app.fetchQQDetails(qqTrack()),error=>error.userMessage.includes('不一致'));
  qq.context.fetch=async url=>response(new URL(url).searchParams.has('mid')
    ? {song_mid:'abc',song_title:'雨',singer_name:'沈以诚',song_play_url_hq:'http://example/audio.m4a'}
    : [{song_mid:'abc',song_title:'雨 (Live)',singer_name:'沈以诚'},{song_mid:'abc',song_title:'雨',singer_name:'沈以诚'}]);
  const imported={...qqTrack(),songid:'123456'};qq.app.state.favorites=[imported];await qq.app.fetchQQDetails(imported);
  assert.equal(imported.songid,'abc');assert.equal(imported.audioUrl,'https://example/audio.m4a');assert.equal(JSON.parse(qq.storage.get('liusheng-library-v1')).favorites[0].songid,'abc');

  const failing=boot(async()=>{throw new TypeError('Failed to fetch');});
  const original=rain();failing.app.state.favorites=[original];
  await failing.app.playTrack(original,{type:'favorites',index:0},37.5);
  assert.equal(failing.audio.src,'','Never retain the previous song after a detail failure');assert.equal(failing.audio.plays,0);
  assert.equal(failing.app.state.isPlaying,false);assert(failing.app.dom.playerStatus.textContent.includes('点击播放重试'));assert.equal(failing.app.getPending(),37.5);
  const qualities=[];failing.context.fetch=async url=>{
    const query=new URL(url).searchParams;
    if(!query.has('n'))return response({data:songs});
    qualities.push(query.get('br'));return response({data:detail});
  };
  failing.app.togglePlayPause();await new Promise(setImmediate);
  assert.equal(failing.audio.plays,1);assert.equal(failing.audio.currentTime,37.5);assert(failing.app.state.isPlaying);
  failing.audio.currentTime=44.25;failing.audio.error={code:3};failing.audio.emit('error');
  assert.equal(original.detailsLoaded,false);assert.equal(original.preferCompatible,true);assert.equal(failing.app.getPending(),44.25);
  failing.app.togglePlayPause();await new Promise(setImmediate);
  assert.equal(failing.audio.plays,2);assert.equal(failing.audio.currentTime,44.25);assert.equal(qualities.at(-1),'2');assert.equal(failing.app.state.favorites.length,1);
  failing.audio.pause();failing.audio.currentTime=55;original.detailsExpiresAt=0;
  failing.app.togglePlayPause();await new Promise(setImmediate);
  assert.equal(failing.audio.plays,3);assert.equal(failing.audio.currentTime,55,'Refreshing an expired URL on resume preserves the position');

  const search=boot(async()=>{throw new TypeError('Failed to fetch');});search.app.state.searchKeyword='雨';
  await search.app.searchAllSources(true);assert(search.app.dom.searchStatus.textContent.includes('代理'));assert(!search.app.dom.searchStatus.textContent.includes('搜索完成'));
  console.log('通过：连接重试及授权拒绝、HTTPS与签名保持、酷我按ID重定位及错曲拒绝、空QQ地址报错、过期地址刷新、失败后按钮重试/断点续播/解码降级、搜索失败提示。');
})().catch(error=>{console.error(error);process.exitCode=1;});
