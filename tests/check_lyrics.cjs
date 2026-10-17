const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const response=value=>({ok:true,text:async()=>typeof value==='string'?value:JSON.stringify(value)});
function boot(fetch,storage=new Map()){
  const script=source.replace(/\}\)\(\);\s*$/,`
    globalThis.renders=[];
    renderLyrics=()=>renders.push({uid:state.currentTrack?.uid,lines:state.lyricLines.length});
    updateLyricsHighlight=()=>{};
    renderMiniSearchList=()=>{}; renderPlaylistList=()=>{}; updateMainFavButton=()=>{};
    globalThis.app={parseLRC,lyricText,sameLyricRecording,ensureTrackLyrics,refreshTrackLyrics,state,dom,playTrack,
      setRequest:value=>playbackRequest=value,stubDetails:()=>ensureTrackDetails=async()=>{}};
  })();`);
  const node=()=>({style:{},classList:{add(){},remove(){},toggle(){}},appendChild(){},addEventListener(){}});
  const context=vm.createContext({console,URLSearchParams,AbortSignal,AbortController,fetch,location:{hostname:'dukewen04.github.io',port:''},
    document:{addEventListener(){},getElementById:node,createElement:node,querySelector:()=>null},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
  vm.runInContext(script,context);
  return {app:context.app,context,node,storage};
}
(async()=>{
  const {app}=boot();
  assert.equal(app.parseLRC({lrc:{lyric:'[00:01.20]one\n[00:02][00:03.250]two'}}).length,3);
  assert.equal(app.parseLRC('[00:02][00:03.250]two')[1].time,3.25);
  const plain=app.parseLRC('[ti:test]\nfirst line\nsecond line');
  assert.equal(plain.length,2);assert.equal(plain[0].time,null);
  assert.equal(app.parseLRC([{time:'32.4',lineLyric:'line'}])[0].time,32.4);
  for(const invalid of ['[ti:test]','[00:00.00]这似乎是一首纯音乐呢，请尽情欣赏它吧！','<html>error</html>',{code:500,msg:'failed'},'https://example.com/lyric'])assert.equal(app.parseLRC(invalid).length,0);
  assert(!app.sameLyricRecording({title:'雨',artist:'沈以诚'},{title:'雨 (Live)',artist:'沈以诚'}));
  assert(!app.sameLyricRecording({title:'雨',artist:'沈以诚'},{title:'雨',artist:'别的歌手'}));
  assert(app.sameLyricRecording({title:'等你下课(with 杨瑞代)',artist:'周杰伦'},{title:'等你下课 (with 杨瑞代)',artist:'周杰伦/杨瑞代'}));

  const own=boot(async url=>{assert(url.endsWith('musicId=1010956'));return response({data:{songinfo:{songName:'想自由',artist:'林宥嘉'},lrclist:[{time:'1.5',lineLyric:'own lyric'}]}});});
  const original={uid:'kuwo-1010956',source:'kuwo',songid:'MUSIC_1010956',title:'想自由',artist:'林宥嘉',audioUrl:'unchanged-audio'};
  assert(await own.app.ensureTrackLyrics(original));assert.equal(original.audioUrl,'unchanged-audio');
  const reloaded=boot(()=>{throw Error('Cached lyrics should not fetch');},own.storage);
  const restored={...original,lrc:null};assert(await reloaded.app.ensureTrackLyrics(restored));assert(restored.lrc.includes('own lyric'));

  const calls=[];
  const fallback=boot(async url=>{
    calls.push(url);
    if(url.includes('songinfoandlrc'))return response({data:null});
    if(url.includes('type=search'))return response([
      {name:'雨 (Live)',artist:'沈以诚',lrc:'https://api.qijieya.cn/meting/?id=wrong-live'},
      {name:'雨',artist:'沈以诚',lrc:'https://api.qijieya.cn/meting/?id=correct'}]);
    if(url.includes('id=correct'))return response({lrc:{lyric:'[00:01]matched lyric'}});
    throw Error('Unexpected request '+url);
  });
  const rain={uid:'rain',source:'kuwo',songid:'MUSIC_123',title:'雨',artist:'沈以诚',audioUrl:'keep-this'};
  assert(await fallback.app.ensureTrackLyrics(rain));assert.equal(rain.lyricSource,'网易云');assert.equal(rain.audioUrl,'keep-this');assert(!calls.some(url=>url.includes('wrong-live')));

  const qq=boot(async url=>url.includes('type=search') ? response([]) : url.includes('mid=right') ? response({song_title:'雨',singer_name:'沈以诚',song_lyric:'',lyric:'plain lyric\nsecond line'}) : response([{song_mid:'wrong',song_title:'雨',singer_name:'别人'},{song_mid:'right',song_title:'雨',singer_name:'沈以诚'}]));
  const qqBorrow={uid:'borrow',source:'netease',title:'雨',artist:'沈以诚',audioUrl:'keep-original'};
  assert(await qq.app.ensureTrackLyrics(qqBorrow));assert.equal(qqBorrow.lyricSource,'QQ音乐');assert.equal(qqBorrow.audioUrl,'keep-original');assert.equal(qq.app.parseLRC(qqBorrow.lrc)[0].time,null);

  let release;
  const stale=boot(()=>new Promise(resolve=>release=()=>resolve(response({lrc:'[00:01]old lyric'}))));
  const old={uid:'old',source:'netease',title:'old',artist:'artist',lrcUrl:'https://example.com/old'};
  stale.app.state.currentTrack=old;stale.app.setRequest(1);
  const pending=stale.app.refreshTrackLyrics(old,1,new AbortController().signal);
  stale.app.state.currentTrack={uid:'new'};stale.app.setRequest(2);stale.app.state.lyricLines=[{time:1,text:'new lyric'}];
  release();await pending;assert.equal(stale.context.renders.length,1);assert.equal(stale.app.state.lyricLines[0].text,'new lyric');

  const nonblocking=boot(()=>new Promise(()=>{}));nonblocking.app.stubDetails();
  for(const key of ['trackTitle','trackArtist','trackSourcePill','trackQualityPill','coverImg','coverPlaceholder','playerStatus','playBtn','playlistSelect'])nonblocking.app.dom[key]=nonblocking.node();
  let played=false;
  nonblocking.app.dom.audio={currentTime:0,volume:0.8,pause(){},play:async()=>{played=true;}};
  await nonblocking.app.playTrack({uid:'audio-first',source:'netease',title:'track',artist:'artist',audioUrl:'original'},null);
  assert(played,'Audio must start while lyric lookup is still pending');
  console.log('通过：纯文本/嵌套JSON/酷我时间轴、多时间标签、版本歌手匹配、歌词缓存、换歌竞态、歌词查询不阻塞播放。');
})().catch(error=>{console.error(error);process.exitCode=1;});
