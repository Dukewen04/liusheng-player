const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const response=data=>({ok:true,json:async()=>data});
function boot(fetch){const c=vm.createContext({fetch,console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,location:{hostname:'127.0.0.1',port:'8766'},localStorage:{getItem(){return null;}},document:{addEventListener(){}}});vm.runInContext(source.replace(/\}\)\(\);\s*$/,`globalThis.app={state,searchKugou,fetchKugouDetails,fetchJooxDetails,fetchQQDetails,serializeTrack,getInterleavedSearchList};})();`),c);return c.app;}
(async()=>{
 const calls=[],app=boot(async raw=>{const u=new URL(raw);calls.push(u);if(u.searchParams.has('n'))return response({code:200,data:{歌曲Hash:'A',歌曲名:'Song',歌手:'Singer',url:'http://cdn.example/s.mp3',歌词:'[00:01]line'}});return response({code:200,data:{歌曲列表:[{song_hash:'B',name:'Other',artist:'Singer'},{song_hash:'A',name:'Song',artist:'Singer'}]}});});
 assert.equal(await app.searchKugou('Song Singer',10),2);assert.equal(await app.searchKugou('Song Singer',10),0,'Search deduplicates stable IDs');
 const track=app.state.searchResults.find(t=>t.songid==='A');await app.fetchKugouDetails(track);assert.equal(calls.at(-1).searchParams.get('n'),'2');assert.equal(track.audioUrl,'https://cdn.example/s.mp3');assert.equal(app.serializeTrack(track).kugouPage,1);assert.equal(app.serializeTrack(track).audioUrl,null);
 app.state.searchResults.push({uid:'qq-C',source:'qq',displayIndex:1});assert(app.getInterleavedSearchList().some(t=>t.source==='kugou'));
 const paged=boot(async raw=>{const page=Number(new URL(raw).searchParams.get('page'));return response({code:200,data:{歌曲列表:Array.from({length:20},(_,i)=>({song_hash:page+'-'+i,name:'Song '+i,artist:'Singer'}))}});});
 assert.equal(await paged.searchKugou('Search',30),30);assert.equal(paged.state.searchResults.at(-1).displayIndex,30);
 const bad=boot(async raw=>new URL(raw).searchParams.has('n')?response({code:200,data:{歌曲Hash:'WRONG',歌曲名:'Song',歌手:'Singer',url:'https://cdn.example/a.mp3'}}):response({code:200,data:{歌曲列表:[{song_hash:'A'}]}}));
 await assert.rejects(bad.fetchKugouDetails({...track,audioUrl:null}),/musicMismatch/);
 const absent=boot(async()=>response({code:200,data:{歌曲列表:[]}}));await assert.rejects(absent.fetchKugouDetails(track),/musicNoMatch/);
 const jooxCalls=[],joox=boot(async(raw,options)=>{const u=new URL(raw);if(u.hostname==='cdn.example')return {ok:true,status:206};jooxCalls.push(u);if(u.searchParams.has('n'))return response({code:200,data:{歌曲名称:'Song',歌手:'Singer',歌曲ID:'1',songmid:'MID',播放链接:{'MP3 320':'https://cdn.example/s.mp3'},歌词内容:'[00:01]lyric'}});return response({code:200,data:{songs:[{songmid:'OTHER',歌曲ID:'2'},{songmid:'MID',歌曲ID:'1'}]}});});
 const j={source:'joox',songMid:'MID',songid:'1',title:'Song',artist:'Singer',keyword:'Song Singer',jooxIndex:1};await joox.fetchJooxDetails(j);assert.equal(jooxCalls.at(-1).searchParams.get('n'),'2');assert.equal(j.audioUrl,'https://cdn.example/s.mp3');
 const wrong=boot(async raw=>new URL(raw).searchParams.has('n')?response({code:200,data:{歌曲名称:'Song',歌手:'Singer',songmid:'WRONG'}}):response({code:200,data:{songs:[{songmid:'MID'}]}}));await assert.rejects(wrong.fetchJooxDetails(j),/musicMismatch/);
 const qq=boot(async()=>response({song_mid:'abc',song_title:'Song',singer_name:'Singer',song_play_url_hq:'https://cdn.example/hq.mp3',song_play_url_sq:'https://cdn.example/sq.flac',song_play_url_pq:'https://cdn.example/pq.flac',song_play_url_standard:'https://cdn.example/std.mp3'}));
 const highest={source:'qq',songid:'abc',title:'Song',artist:'Singer',preferHighestQuality:true};await qq.fetchQQDetails(highest);assert(highest.audioUrl.endsWith('pq.flac'));assert.equal(highest.audioOptions.length,4);
 highest.preferredAudioQuality='song_play_url_hq';await qq.fetchQQDetails(highest);assert(highest.audioUrl.endsWith('hq.mp3'));
 highest.preferCompatible=true;await qq.fetchQQDetails(highest);assert(highest.audioUrl.endsWith('std.mp3'),'A saved high-quality preference must not prevent playback recovery');
 const jHigh=boot(async raw=>new URL(raw).searchParams.has('n')?response({code:200,data:{歌曲名称:'Song',歌手:'Singer',歌曲ID:'1',songmid:'MID',播放链接:{'MP3 320':'https://cdn.example/s.mp3','无损FLAC':'https://cdn.example/s.flac'}}}):response({code:200,data:{songs:[{songmid:'MID'}]}}));
 const lossless={...j,preferHighestQuality:true};await jHigh.fetchJooxDetails(lossless);assert(lossless.audioUrl.endsWith('.flac'));assert.equal(lossless.audioOptions.length,2);
 console.log('通过：酷狗搜索去重/分页字段持久化、HTTPS地址、按Hash重定位、错曲拒绝、聚合列表包含新音源、JOOX按稳定ID重新定位。');
})().catch(error=>{console.error(error);process.exitCode=1;});
