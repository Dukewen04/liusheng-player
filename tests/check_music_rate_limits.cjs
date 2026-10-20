const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const response=(value,status=200)=>({ok:status>=200&&status<300,status,text:async()=>typeof value==='string'?value:JSON.stringify(value)});
function boot(fetch){
  const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,fetch,document:{addEventListener(){}},localStorage:{getItem(){return null;}}});
  vm.runInContext(source.replace(/\}\)\(\);\s*$/,`globalThis.app={readMusicJSON,searchKuwo,fetchKuwoDetails,ensureTrackDetails,sameImportRecording,serializeTrack,state,begin:()=>importController=new AbortController()};})();`),c);
  return c;
}
(async()=>{
  for(const [api,message,empty] of [['kugou.music',"未找到与'No song'相关的歌曲",'歌曲列表'],['joox_music','未搜索到相关歌曲','songs']]){
    let requests=0;const missing=boot(async raw=>{requests++;return new URL(raw).searchParams.get('name')==='valid'||new URL(raw).searchParams.get('msg')==='valid'?response({code:200,data:{[empty]:[]}}):response({code:500,message},500);});
    missing.app.begin();const query=api==='kugou.music'?'name':'msg',base='https://apicx.asia/api/'+api;
    const noMatch=await missing.app.readMusicJSON(base+'?'+query+'=missing');assert.equal(noMatch.data[empty].length,0);
    await missing.app.readMusicJSON(base+'?'+query+'=missing');assert.equal(requests,1,'Explicit no-results responses are cached as empty searches');
    await missing.app.readMusicJSON(base+'?'+query+'=valid');assert.equal(requests,2,'A missing song must not cool down the entire source');
    const positive=boot(async()=>response({code:500,message}));assert.equal((await positive.app.readMusicJSON(base+'?'+query+'=missing')).data[empty].length,0);
    const outage=boot(async()=>response({code:500,message:'数据库暂时不可用'},500));outage.app.begin();await assert.rejects(outage.app.readMusicJSON(base+'?'+query+'=missing'),e=>e.retryable,'Real server failures still defer');
    const detail=boot(async()=>response({code:500,message},500));detail.app.begin();await assert.rejects(detail.app.readMusicJSON(base+'?'+query+'=missing&n=1'),e=>e.retryable,'A detail failure must not become a successful empty search');
  }
  let reusedQueries=0;const reuse=boot(async url=>{reusedQueries++;const q=new URL(url).searchParams;return response({data:q.has('n')?{rid:'123',song:'Song',singer:'Singer',url:'https://cdn.example/song.mp3'}:[{rid:'123',song:'Song',singer:'Singer'}]});});
  reuse.app.begin();await reuse.app.searchKuwo('Original Alias Singer',20);
  await reuse.app.fetchKuwoDetails({uid:'kuwo-123',source:'kuwo',songid:'123',title:'Song',artist:'Singer',keyword:'Original Alias Singer',preferCompatible:true});
  assert.equal(reusedQueries,2,'Kuwo details reuse the exact original search instead of searching the returned title again');
  let calls=0;
  const rate=boot(async()=>{calls++;return response('请求过于频繁');});
  const url='https://tang.api.s01s.cn/music_open_api.php?msg=example';
  const errors=await Promise.allSettled([rate.app.readMusicJSON(url),rate.app.readMusicJSON(url)]);
  assert(errors.every(r=>r.status==='rejected'&&r.reason.retryable));assert.equal(calls,1,'Queued requests must respect the circuit breaker without hitting the throttled API again');
  const httpRate=boot(async()=>response({},429));
  await assert.rejects(httpRate.app.readMusicJSON('https://api.example/'),e=>e.retryable);
  const jsonRate=boot(async()=>response({code:429,message:'请求过于频繁'}));
  await assert.rejects(jsonRate.app.readMusicJSON(url),e=>e.retryable);
  const malformed=boot(async()=>response('service temporarily down'));
  await assert.rejects(malformed.app.readMusicJSON('https://api.example/'),e=>e.retryable);
  const lyric=boot(async()=>response({song_lyric:'请求过于频繁'}));
  assert.equal((await lyric.app.readMusicJSON(url)).song_lyric,'请求过于频繁','Lyric text is not a rate-limit response');
  let release;calls=0;
  const queue=boot(async()=>{calls++;await new Promise(r=>release=r);return response([]);});
  const first=queue.app.readMusicJSON(url);await new Promise(setImmediate);
  const stop=new AbortController();const second=queue.app.readMusicJSON(url,stop.signal);stop.abort();
  await assert.rejects(second,e=>e.name==='AbortError');release();await first;assert.equal(calls,1,'Cancelling a queued request never starts its fetch');
  const starts=[];const paced=boot(async()=>{starts.push(Date.now());return response([]);});
  await Promise.all([paced.app.readMusicJSON(url+'&a=1'),paced.app.readMusicJSON(url+'&a=2')]);
  assert(starts[1]-starts[0]>=400,'QQ requests are spaced instead of burst concurrently');
  const urls=[];
  const kuwo=boot(async raw=>{
    const u=new URL(raw);urls.push(u);
    assert(!u.searchParams.has('limit')&&!u.searchParams.has('page'),'Do not send parameters that break the current provider');
    return response(u.searchParams.has('n')?{code:1,data:{rid:'MUSIC_1',song:'Example',singer:'Singer',url:'https://cdn.example/a.flac',format:'flac'}}:
      {code:1,data:Array.from({length:10},(_,i)=>({rid:'MUSIC_'+(i+1),song:i?'Other '+i:'Example',singer:'Singer'}))});
  });
  await kuwo.app.searchKuwo('Example Singer',5);assert.equal(kuwo.app.state.searchResults.length,5,'Apply the requested display limit locally');
  const track={source:'kuwo',songid:'MUSIC_1',title:'Example',artist:'Singer'};
  await kuwo.app.fetchKuwoDetails(track);assert.equal(track.audioUrl,'https://cdn.example/a.flac');assert(urls.some(u=>u.searchParams.get('n')==='1'));
  assert(kuwo.app.sameImportRecording({title:'Example',artist:'A/B'},{title:'Example',artist:'B&A'}));
  assert(kuwo.app.sameImportRecording({title:'Example',artist:'Singer'},{title:'Example-《Show》动画主题曲',artist:'Singer'}));
  assert(!kuwo.app.sameImportRecording({title:'Example',artist:'Singer'},{title:'Example (Live)',artist:'Singer'}));
  assert(!kuwo.app.sameImportRecording({title:'Example',artist:'Singer'},{title:'Example',artist:'Singer',album:'Instrumental Edition'}));
  const resourceTitle='Example (Movie Name)';
  const alias=boot(async raw=>response(new URL(raw).searchParams.has('n')?
    {code:1,data:{rid:'MUSIC_1',song:resourceTitle,singer:'Singer',url:'https://cdn.example/a.flac',format:'flac'}}:
    {code:1,data:[{rid:'MUSIC_1',song:resourceTitle,singer:'Singer',album:'Movie Name Soundtrack'}]}));
  const imported={source:'kuwo',uid:'kuwo-1',songid:'MUSIC_1',title:'Example',artist:'Singer',album:'Imported Album',sourceTitle:resourceTitle,sourceArtist:'Singer',sourceAlbum:'Movie Name Soundtrack'};
  await alias.app.ensureTrackDetails(imported,{silent:true});
  assert.equal(imported.title,'Example');assert.equal(imported.album,'Imported Album');assert(imported.audioUrl);
  const restored=alias.app.serializeTrack(imported);await alias.app.ensureTrackDetails(restored,{silent:true});
  assert.equal(restored.title,'Example');assert(restored.audioUrl,'Source metadata survives export and address refresh while display data stays unchanged');
  await assert.rejects(alias.app.ensureTrackDetails({...restored,sourceTitle:'Different Song',detailsLoaded:false},{silent:true}),e=>e.message==='musicMismatch');
  console.log('通过：QQ文本及JSON限流识别、串行请求与冷却、队列取消、服务错误可重试、歌词不误判限流、酷我移除故障参数并本地截断、详情按稳定ID匹配。');
})().catch(e=>{console.error(e);process.exitCode=1;});
