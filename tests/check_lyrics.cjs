const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const response=value=>({ok:true,text:async()=>typeof value==='string'?value:JSON.stringify(value)});
function boot(fetch,storage=new Map()){
  const script=source.replace(/\}\)\(\);\s*$/,`
    globalThis.renders=[];
    const realUpdateLyricsHighlight=updateLyricsHighlight,realRenderLyrics=renderLyrics;
    renderLyrics=()=>renders.push({uid:state.currentTrack?.uid,lines:state.lyricLines.length});
    updateLyricsHighlight=()=>{};
    renderMiniSearchList=()=>{}; renderPlaylistList=()=>{}; updateMainFavButton=()=>{};
    globalThis.app={parseLRC,lyricText,sameLyricRecording,ensureTrackLyrics,refreshTrackLyrics,state,dom,playTrack,realUpdateLyricsHighlight,realRenderLyrics,setLyricsMode,
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

  const sync=boot(),active=new Set();
  const box={scrollTop:200,clientHeight:300,clientTop:0,getBoundingClientRect:()=>({top:600}),scrollTo({top}){this.scrollTop=top;}};
  const elements=[500,550,600].map((top,index)=>({offsetTop:9999,offsetHeight:40,
    getBoundingClientRect:()=>({top:600+top-box.scrollTop}),classList:{add:()=>active.add(index),remove:()=>active.delete(index)}}));
  sync.app.dom.lyricsContainer=box;
  sync.app.dom.lyricsInner={querySelectorAll:()=>[...active].map(i=>elements[i]),querySelector:selector=>elements[Number(selector.match(/index="(\d+)"/)[1])],appendChild(){}};
  sync.app.state.lyricLines=[{time:5,text:'first'},{time:10,text:'second'},{time:15,text:'third'}];
  sync.app.realUpdateLyricsHighlight(12);assert.equal(sync.app.state.currentLyricIndex,1);assert.deepEqual([...active],[1]);assert.equal(box.scrollTop,420,'Center using the lyric box coordinates, not the page offset');
  sync.app.realUpdateLyricsHighlight(2);assert.equal(sync.app.state.currentLyricIndex,-1);assert.equal(active.size,0);assert.equal(box.scrollTop,0,'Seeking back into the intro clears the old lyric');
  sync.app.realUpdateLyricsHighlight(10);assert.deepEqual([...active],[1]);
  sync.app.realUpdateLyricsHighlight(15);assert.deepEqual([...active],[2]);
  box.scrollTop=500;sync.app.state.lyricLines=[];sync.app.realRenderLyrics();assert.equal(box.scrollTop,0,'Changing lyrics resets the previous scroll');

  const classes=new Set(),attrs={};
  sync.context.document.body={classList:{toggle:(name,on)=>on ? classes.add(name) : classes.delete(name)}};
  sync.app.dom.lyricsModeBtn={textContent:'',setAttribute:(name,value)=>attrs[name]=value};
  sync.app.dom.audio={currentTime:37.5,src:'original-audio',paused:false};
  const audioBefore=JSON.stringify(sync.app.dom.audio);
  sync.app.setLyricsMode(true);assert(classes.has('lyrics-mode'));assert.equal(attrs['aria-pressed'],'true');assert.equal(sync.app.dom.lyricsModeBtn.textContent,'退出纯净模式 · Esc');assert.equal(sync.storage.get('liusheng-lyrics-mode'),'1');
  sync.app.state.language='en';sync.app.setLyricsMode(true);assert.equal(sync.app.dom.lyricsModeBtn.textContent,'Exit clean mode · Esc');
  sync.app.setLyricsMode(false);assert(!classes.has('lyrics-mode'));assert.equal(attrs['aria-pressed'],'false');assert.equal(sync.storage.get('liusheng-lyrics-mode'),'0');assert.equal(sync.app.dom.lyricsModeBtn.textContent,'Clean mode');assert.equal(JSON.stringify(sync.app.dom.audio),audioBefore,'Changing view must preserve the audio source, playing state and position');

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

  let slowCancelled=false,deadline;
  const parallel=boot(async(url,{signal})=>{
    if(url.includes('songinfoandlrc'))return response({data:null});
    if(url.includes('type=search'))return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{slowCancelled=true;reject(signal.reason);},{once:true}));
    return url.includes('mid=right') ? response({song_title:'雨',singer_name:'沈以诚',lyric:'[00:01]fast lyrics'}) : response([{song_mid:'right',song_title:'雨',singer_name:'沈以诚'}]);
  });
  const slowTrack={uid:'slow',source:'kuwo',songid:'123',title:'雨',artist:'沈以诚',audioUrl:'keep-audio'};
  try{
    assert(await Promise.race([parallel.app.ensureTrackLyrics(slowTrack),new Promise((resolve,reject)=>{deadline=setTimeout(()=>reject(Error('Slow provider blocked the fallback')),1000);})]));
  }finally{clearTimeout(deadline);}
  assert(slowCancelled,'Cancel the remaining provider after finding lyrics');assert.equal(slowTrack.lyricSource,'QQ音乐');assert.equal(slowTrack.audioUrl,'keep-audio');

  let release;
  const stale=boot(()=>new Promise(resolve=>release=()=>resolve(response({lrc:'[00:01]old lyric'}))));
  const old={uid:'old',source:'netease',title:'old',artist:'artist',lrcUrl:'https://example.com/old'};
  stale.app.state.currentTrack=old;stale.app.setRequest(1);
  const pending=stale.app.refreshTrackLyrics(old,1,new AbortController().signal);
  stale.app.state.currentTrack={uid:'new'};stale.app.setRequest(2);stale.app.state.lyricLines=[{time:1,text:'new lyric'}];
  release();await pending;assert.equal(stale.context.renders.length,1);assert.equal(stale.app.state.lyricLines[0].text,'new lyric');

  const nonblocking=boot(()=>new Promise(()=>{}));nonblocking.app.stubDetails();
  for(const key of ['trackTitle','trackArtist','trackSourcePill','trackQualityPill','coverImg','coverPlaceholder','playerStatus','playBtn','playlistSelect','currentTime','totalTime','progressBar','progressHandle'])nonblocking.app.dom[key]=nonblocking.node();
  let played=false;
  nonblocking.app.dom.audio={currentTime:0,volume:0.8,pause(){},removeAttribute(){},load(){},play:async()=>{played=true;}};
  await nonblocking.app.playTrack({uid:'audio-first',source:'netease',title:'track',artist:'artist',audioUrl:'original'},null);
  assert(played,'Audio must start while lyric lookup is still pending');
  console.log('通过：纯文本/嵌套JSON/酷我时间轴、多时间标签、版本歌手匹配、歌词缓存、换歌竞态、并行查询及取消慢接口、歌词查询不阻塞播放、歌词居中及前奏/拖动高亮、纯净模式及不打断播放。');
})().catch(error=>{console.error(error);process.exitCode=1;});
