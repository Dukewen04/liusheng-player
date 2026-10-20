import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlaylist, loadPlaylist, loadPlaylistName, handlePlaylist } from '../services/playlist-service.mjs';
const song = id => ({id,name:'Song '+id,ar:[{name:'Singer'}]});

test('short links resolve server-side and never forward account parameters',async()=>{
 const calls=[];
 const fetcher=async (raw,options)=>{assert.equal(options.redirect,'manual');calls.push(String(raw));if(String(raw).startsWith('https://163cn.tv/'))return new Response(null,{status:302,headers:{Location:'https://music.163.com/m/playlist?id=123&userid=999'}});return Response.json({code:200,playlist:{name:'Example',trackCount:1,trackIds:[{id:1}],tracks:[song(1)]}});};
 const data=await loadPlaylist('分享歌单 https://163cn.tv/Example',new AbortController().signal,fetcher);
 assert.equal(data.playlists[0].tracks.length,1);assert(!calls[1].includes('userid'));assert.equal(data.playlists[0].tracks[0].songid,'1');
});
test('reject arbitrary hosts and unsafe redirects',async()=>{
 for(const url of ['https://evil.test/x','http://127.0.0.1/x','https://user@music.163.com/playlist?id=1','https://music.163.com:8766/playlist?id=1'])await assert.rejects(resolvePlaylist(url,new AbortController().signal));
 await assert.rejects(resolvePlaylist('https://163cn.tv/Example',new AbortController().signal,async()=>new Response(null,{status:302,headers:{Location:'http://127.0.0.1/'}})));
});
test('fetch missing songs in batches and retain original order',async()=>{
 const ids=Array.from({length:205},(_,i)=>205-i),sizes=[];
 const data=await loadPlaylist('https://music.163.com/playlist?id=123',new AbortController().signal,async raw=>{
  const url=new URL(raw);
  if(url.pathname.includes('/v6/'))return Response.json({code:200,playlist:{trackCount:ids.length,trackIds:ids.map(id=>({id})),tracks:[song(205)]}});
  const batch=JSON.parse(url.searchParams.get('ids'));sizes.push(batch.length);return Response.json({code:200,songs:[...batch].reverse().map(song)});
 });
 assert.deepEqual(sizes.sort((a,b)=>a-b),[4,100,100]);assert.deepEqual(data.playlists[0].tracks.map(t=>Number(t.songid)),ids);
});
test('incomplete and private playlists fail without silently importing a subset',async()=>{
 await assert.rejects(loadPlaylist('https://music.163.com/playlist?id=123',new AbortController().signal,async()=>Response.json({code:403})),/未开放/);
 await assert.rejects(loadPlaylist('https://music.163.com/playlist?id=123',new AbortController().signal,async()=>Response.json({code:200,playlist:{trackCount:2,trackIds:[{id:1}],tracks:[song(1)]}})),/不完整/);
});
test('CORS only permits the player and local development; no data in preflight',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json({code:200,playlist:{trackCount:1,tracks:[song(1)]}});};
 const endpoint='https://service.example/api/playlist?url='+encodeURIComponent('https://music.163.com/playlist?id=123');
 const blocked=await handlePlaylist(new Request(endpoint,{headers:{Origin:'https://evil.test'}}),fetcher);assert.equal(blocked.status,403);assert.equal(calls,0);
 const preflight=await handlePlaylist(new Request(endpoint,{method:'OPTIONS',headers:{Origin:'https://dukewen04.github.io'}}),fetcher);assert.equal(preflight.status,204);assert.equal(calls,0);
 const ok=await handlePlaylist(new Request(endpoint,{headers:{Origin:'https://dukewen04.github.io'}}),fetcher);assert.equal(ok.status,200);assert.equal(ok.headers.get('Access-Control-Allow-Origin'),'https://dukewen04.github.io');assert.equal((await ok.json()).playlists[0].tracks.length,1);
});

test('metadata reads original platform names without fetching the song proxy',async()=>{
 const qq=await loadPlaylistName('https://y.qq.com/n/ryqq/playlist/123',new AbortController().signal,async(raw,options)=>{
  assert.equal(new URL(raw).hostname,'c.y.qq.com');assert.equal(options.headers.Referer,'https://y.qq.com/');
  return Response.json({code:0,cdlist:[{dissname:'我喜欢'}]});
 });
 assert.equal(qq.name,'我喜欢');assert(!('tracks' in qq));
 const netease=await loadPlaylistName('https://music.163.com/playlist?id=123',new AbortController().signal,async()=>Response.json({code:200,playlist:{name:'私人歌单 2026-10-20'}}));
 assert.equal(netease.name,'私人歌单 2026-10-20','Do not strip dates that are part of the real platform name');
});
test('QQ playlist preserves the original name and survives optional name failures',async()=>{
 const rows=[{name:'Song',artist:'Singer',url:'https://api.qijieya.cn/meting/?server=tencent&type=url&id=abc'}];
 for(const fail of [false,true]){
  const data=await loadPlaylist('https://y.qq.com/n/ryqq/playlist/123',new AbortController().signal,async raw=>{
   if(new URL(raw).hostname==='c.y.qq.com'){if(fail)throw Error('metadata offline');return Response.json({code:0,cdlist:[{dissname:'我喜欢'}]});}
   return Response.json(rows);
  });
  assert.equal(data.playlists[0].name,fail?'QQ 歌单 123':'我喜欢');assert.equal(data.playlists[0].tracks.length,1);
 }
});
test('metadata endpoint returns a name only and retains origin protection',async()=>{
 const url='https://service.example/api/playlist?meta=1&url='+encodeURIComponent('https://music.163.com/playlist?id=123');
 const response=await handlePlaylist(new Request(url,{headers:{Origin:'https://dukewen04.github.io'}}),async()=>Response.json({code:200,playlist:{name:'Original'}}));
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.name,'Original');assert(!('playlists' in data));
});
