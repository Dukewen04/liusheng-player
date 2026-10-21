const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
function boot(){
 const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,location:{hostname:'dukewen04.github.io',port:''},document:{addEventListener(){}},localStorage:{getItem(){return null;}}});
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
 const realEnsure=ensureTrackDetails;
 searchNetease=(k,p,n,pool)=>globalThis.search('netease',k,pool);searchQQ=(k,n,pool)=>globalThis.search('qq',k,pool);searchKuwo=(k,n,pool)=>globalThis.search('kuwo',k,pool);searchJoox=(k,n,pool)=>globalThis.search('joox',k,pool);searchKugou=(k,n,pool)=>globalThis.search('kugou',k,pool);
 ensureTrackDetails=async track=>{Object.assign(track,{audioUrl:'https://cdn.example/'+track.uid,detailsLoaded:true});if(track.wrongDetails)track.title='Completely different track';};
 probeRecording=async track=>{globalThis.probes.push(track.uid);if(track.broken)throw Error('Unplayable');return {...track};};
 renderLyrics=()=>{};ensureTrackLyrics=async track=>{globalThis.lyricTitle=track.title;track.lrc='[00:01]actual version';};
 globalThis.app={findBestImportRecording,similarImportTitleScore,serializeTrack,realEnsure,refreshTrackLyrics};
 })();`),c);c.probes=[];c.search=async(source,k,pool)=>{for(const t of c.catalog||[]){if(t.source!==source||pool.trackMap.has(t.uid))continue;pool.trackMap.set(t.uid,t);pool.searchResults.push({...t});}};return c;
}
const original={uid:'imported',source:'qq',title:'遗憾 (莫非要你尝尽了苦悲)',artist:'DinDin',album:'Imported album'};
const track=(uid,title,extra={})=>({uid,source:'kuwo',songid:uid,title,artist:'DinDin',quality:'128k',...extra});
const run=(c,o=original)=>c.app.findBestImportRecording(o,new AbortController().signal,()=>{},null,{compareAll:false,skipQQ:true});
(async()=>{
 const c=boot(),rnb=track('rnb',original.title+' (R&B版)'),live=track('live',original.title+' (Live)'),dj=track('dj',original.title+' (R&B版|DJ 炫熙版)');
 assert(c.app.similarImportTitleScore(original,rnb)>0);assert(c.app.similarImportTitleScore(original,live)>0);assert(c.app.similarImportTitleScore(original,track('plain-live',original.title+' Live'))>0);assert(c.app.similarImportTitleScore(original,track('plain-rnb',original.title+' R&B'))>0);assert(c.app.similarImportTitleScore(original,rnb)>c.app.similarImportTitleScore(original,dj));
 for(const bad of [{...rnb,artist:'Another singer'},track('unrelated','完全不同的歌曲'),track('inst',original.title+' (伴奏版)'),{...rnb,album:'Instrumental Edition'}])assert.equal(c.app.similarImportTitleScore(original,bad),0);
 assert.equal(c.app.similarImportTitleScore({title:'爱',artist:'Singer'},{title:'你的爱',artist:'Singer'}),0,'One-character containment is too broad');
 assert(c.app.similarImportTitleScore({title:'abcdefghij',artist:'Singer'},{title:'abcdefxhij',artist:'Singer'})>0,'A 90% title similarity qualifies');
 assert.equal(c.app.similarImportTitleScore({title:'abcd',artist:'Singer'},{title:'abxd',artist:'Singer'}),0,'A short unrelated title does not qualify');
 assert.equal(c.app.similarImportTitleScore({title:'a'.repeat(200),artist:'Singer'},{title:'a'.repeat(200)+'x',artist:'Singer'}),0,'Unbounded metadata does not enter edit-distance matching');
 c.catalog=[dj,rnb,live];const selected=await run(c);assert.equal(selected.uid,'rnb');assert.equal(selected.title,original.title);assert.equal(selected.artist,original.artist);assert.equal(selected.album,original.album);assert.equal(selected.sourceTitle,rnb.title);assert.equal(selected.importMatchType,'same-artist-similar-version');assert.deepEqual(c.probes,['rnb']);
 c.catalog=[rnb,track('exact',original.title)];c.probes=[];assert.equal((await run(c)).uid,'exact');assert(!c.probes.includes('rnb'),'A playable original version always wins');
 c.catalog=[{...rnb,broken:true},live];c.probes=[];assert.equal((await run(c)).uid,'live');assert.deepEqual(c.probes,['rnb','live'],'Similar candidates must pass actual playback verification');
 c.catalog=[{...rnb,wrongDetails:true},live];assert.equal((await run(c)).uid,'live','Recheck matching after fetching details');
 c.catalog=[track('wrong',original.title,{artist:'Other performer'})];assert.equal(await run(c),null,'Same title does not permit switching performer');
 c.catalog=[track('near','abcdefxhij',{artist:'Singer'})];assert.equal((await run(c,{...original,title:'abcdefghij',artist:'Singer'})).uid,'near');
 c.catalog=[track('live-only','你的姑娘 (Live)',{artist:'隔壁老樊'})];assert.equal((await run(c,{...original,title:'姑娘',artist:'隔壁老樊'})).uid,'live-only','Bounded title containment plus a version label can recover the song');

 c.fetch=async raw=>{const q=new URL(raw).searchParams;return {ok:true,status:200,text:async()=>JSON.stringify({code:1,data:q.has('n')?{rid:'rnb',song:rnb.title,singer:'DinDin',url:'https://cdn.example/rnb.mp3'}:[{rid:'rnb',song:rnb.title,singer:'DinDin'}]})};};
 const restored=c.app.serializeTrack(selected);await c.app.realEnsure(restored,{silent:true});assert.equal(restored.title,original.title);assert.equal(restored.sourceTitle,rnb.title);assert(restored.audioUrl);
 await assert.rejects(c.app.realEnsure({...restored,sourceTitle:'Completely different title',detailsLoaded:false},{silent:true}),e=>e.message==='musicMismatch');
 await c.app.refreshTrackLyrics(restored,0,new AbortController().signal);assert.equal(c.lyricTitle,rnb.title,'Lyrics follow the actual matched version');
 assert(html.includes("?'相似版本：':'近似匹配：'"));
 console.log('通过：原版优先、同歌手R&B/Live及包含/90%高相似兜底、差异较小候选优先、逐个实播失败再降级、异歌手/伴奏/短歌名拒绝、详情重检、实际版本持久化/刷新/歌词。');
})().catch(e=>{console.error(e);process.exitCode=1;});
