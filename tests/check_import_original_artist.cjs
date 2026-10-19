const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
let candidates=[],queries=[],probed=[];
const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,
  document:{addEventListener(){}},localStorage:{getItem(){return null;}}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
 const search=async(keyword,page,limit,pool)=>globalThis.search(keyword,pool);
 searchNetease=search;searchQQ=(k,n,p)=>search(k,1,n,p);searchKuwo=searchQQ;searchJoox=searchQQ;searchKugou=searchQQ;
 ensureTrackDetails=async track=>Object.assign(track,{audioUrl:'https://example.test/'+track.uid,quality:track.quality||'320k'});
 probeRecording=async track=>globalThis.probe(track);
 globalThis.find=findBestImportRecording;globalThis.rank=importFallbackRank;
})();`),c);
c.search=async(keyword,pool)=>{queries.push(keyword);for(const t of candidates)if(!pool.trackMap.has(t.uid)){pool.trackMap.set(t.uid,t);pool.searchResults.push({...t});}};
c.probe=async track=>{probed.push(track.uid);if(track.uid==='imported'||track.broken)throw Error('unavailable');return {...track};};
const track=(uid,title,artist,quality='320k')=>({uid,title,artist,source:'qq',quality});
const find=async original=>{queries=[];probed=[];return c.find(original,new AbortController().signal,()=>{});};
(async()=>{
  const imported=track('imported','Song (翻自 Original Singer)','Cover Singer');
  candidates=[track('cover','Song','Cover Singer','lossless'),track('original','Song','Original Singer','128k'),track('stranger','Song','Other Singer','lossless')];
  assert.equal((await find(imported)).uid,'original','Original singer takes precedence over higher-quality cover artist');
  assert(queries.includes('Song Original Singer'),'Retry with the base title and explicit original singer');
  assert(!probed.includes('stranger'));
  candidates=[track('exact',imported.title,imported.artist),...candidates];
  assert.equal((await find(imported)).uid,'exact','Playable exact version stays preferred');
  assert(!queries.includes('Song Original Singer'),'No fallback search if strict matching succeeds');
  candidates=[track('studio','Song','Singer','128k'),track('hq','Song (重制版)','Singer','lossless'),track('live','Song (Live)','Singer','lossless')];
  assert.equal((await find(track('imported','Song (现场版)','Singer'))).uid,'hq','Fallback still compares playable quality tiers');
  assert(!probed.includes('live'));
  candidates=[track('wrong','Song','Someone Else','lossless'),track('karaoke','Song (伴奏)','Singer','lossless')];
  assert.equal(await find(track('imported','Song (Live)','Singer')),null,'Unknown original singer must not be guessed from same title');
  candidates=[{...track('bad','Song','Original Singer','lossless'),broken:true},track('ok','Song','Original Singer','128k')];
  assert.equal((await find(imported)).uid,'ok','Original singer fallback must actually pass playback verification');
  assert.equal(c.rank(track('a','Live Forever (现场版)','Singer'),track('b','Live Forever','Singer')),2,'Live in a real song title is not a version tag');
  const stop=new AbortController();stop.abort();
  await assert.rejects(c.find(imported,stop.signal,()=>{}),error=>error.name==='AbortError');
  console.log('通过：严格同版本优先、原唱标注提取与搜索、原唱优先于翻唱歌手、原歌手兜底、高音质及实际可播验证、不猜同名原唱、不选现场伴奏、取消清理。');
})().catch(error=>{console.error(error);process.exitCode=1;});
