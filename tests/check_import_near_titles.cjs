const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const c=vm.createContext({console,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,location:{hostname:'dukewen04.github.io',port:''},document:{addEventListener(){}},localStorage:{getItem(){return null;}}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
 const realEnsure=ensureTrackDetails;
 searchNetease=(k,p,n,pool)=>globalThis.search('netease',k,pool);searchQQ=(k,n,pool)=>globalThis.search('qq',k,pool);
 searchKuwo=(k,n,pool)=>globalThis.search('kuwo',k,pool);searchJoox=(k,n,pool)=>globalThis.search('joox',k,pool);searchKugou=(k,n,pool)=>globalThis.search('kugou',k,pool);
 ensureTrackDetails=async track=>{if(track.uid==='imported')throw Error('No exact audio');Object.assign(track,{audioUrl:'https://cdn.example/'+track.uid,detailsLoaded:true,quality:track.quality||'320k'});};
 probeRecording=async track=>{if(track.uid==='imported'||track.broken)throw Error('No audio');globalThis.probed.push(track.uid);return {...track};};
 renderLyrics=()=>{};ensureTrackLyrics=async track=>{globalThis.lyricTitle=track.title;track.lrc='[00:01]Matched lyrics';};
 globalThis.app={findBestImportRecording,verifyImportData,serializeTrack,nearImportTitleScore,normalizeImportTitle,spellImportNumbers,refreshTrackLyrics,realEnsure};
})();`),c);
let catalog=[],artistOnly=false;const queries=[];c.probed=[];
c.search=async(source,keyword,pool)=>{
 queries.push(keyword);for(const track of catalog){
  if(track.source!==source||(artistOnly&&keyword!==track.artist)||pool.trackMap.has(track.uid))continue;
  pool.trackMap.set(track.uid,track);pool.searchResults.push({...track});
 }
};
const original=(title,artist)=>({uid:'imported',songid:'original',source:'qq',title,artist,album:'Imported Album'});
const choice=(uid,title,artist,source='qq',quality='lossless')=>({uid,songid:uid,source,title,artist,quality});
const find=track=>c.app.findBestImportRecording(track,new AbortController().signal,()=>{});
(async()=>{
 catalog=[choice('seventeen','十七歲','劉德華')];
 const seventeen=await find(original('17岁','刘德华'));
 assert.equal(seventeen.uid,'seventeen');assert.equal(seventeen.title,'17岁');assert.equal(seventeen.artist,'刘德华');assert.equal(seventeen.sourceTitle,'十七歲');assert.equal(seventeen.sourceArtist,'劉德華');
 assert.equal(seventeen.importMatchType,'same-artist-near-title');
 assert.equal(c.app.normalizeImportTitle('一千零一夜'),c.app.normalizeImportTitle('1001夜'));
 assert.equal(c.app.spellImportNumbers('17岁'),'十七岁');assert.equal(c.app.spellImportNumbers('007'),'007');
 catalog=[choice('qqgirl','你的姑娘','隔壁老樊')];artistOnly=true;queries.length=0;
 const girl=await find(original('姑娘','隔壁老樊'));
 assert.equal(girl.uid,'qqgirl');assert.equal(girl.title,'姑娘');assert.equal(girl.sourceTitle,'你的姑娘');assert.equal(girl.album,'Imported Album');assert(queries.includes('隔壁老樊'),'Only broaden to artist catalog after exact matching fails');
 artistOnly=false;catalog=[choice('exact','姑娘','隔壁老樊','qq','128k'),choice('near','你的姑娘','隔壁老樊')];queries.length=0;
 assert.equal((await find(original('姑娘','隔壁老樊'))).uid,'exact','Playable exact recording always outranks fuzzy alternatives');assert(!queries.includes('隔壁老樊'));
 catalog=[choice('one','你的姑娘','隔壁老樊'),choice('two','老姑娘','隔壁老樊')];
 const result=await c.app.verifyImportData({playlists:[{id:'list',name:'Example',tracks:[original('姑娘','隔壁老樊')]}]},new AbortController(),()=>{});
 assert.equal(result.stats.deferred,1);assert.equal(result.stats.failed,0);assert.equal(result.data.playlists[0].tracks[0].uid,'imported');assert(result.data.playlists[0].tracks[0].importCheckReason.includes('多个相近歌名'));
 for(const bad of [choice('other','你的姑娘','另一歌手'),choice('live','你的姑娘 (Live)','隔壁老樊'),choice('dj','你的姑娘 (DJ版)','隔壁老樊'),{...choice('inst','你的姑娘','隔壁老樊'),album:'Instrumental Edition'}])assert.equal(c.app.nearImportTitleScore(original('姑娘','隔壁老樊'),bad),0);
 assert.equal(c.app.nearImportTitleScore(original('爱','Singer'),choice('long','你的爱','Singer')),0,'One-character containment is too ambiguous');
 assert.equal(c.app.nearImportTitleScore(original('姑娘',''),choice('unknown','你的姑娘','')),0,'An unknown singer cannot qualify');
 catalog=[{...choice('bad','你的姑娘','隔壁老樊'),broken:true}];c.probed=[];
 assert.equal(await find(original('姑娘','隔壁老樊')),null,'A similar title still needs a successful playback check');
 c.fetch=async()=>({ok:true,status:200,text:async()=>JSON.stringify({song_mid:'qqgirl',song_title:'你的姑娘',singer_name:'隔壁老樊',song_play_url_sq:'https://cdn.example/girl.flac'})});
 const restored=c.app.serializeTrack(girl);await c.app.realEnsure(restored,{silent:true});
 assert.equal(restored.title,'姑娘');assert.equal(restored.sourceTitle,'你的姑娘');assert(restored.audioUrl);
 await assert.rejects(c.app.realEnsure({...restored,sourceTitle:'完全不同的歌',detailsLoaded:false},{silent:true}),e=>e.message==='musicMismatch');
 await c.app.refreshTrackLyrics(restored,0,new AbortController().signal);assert.equal(c.lyricTitle,'你的姑娘');assert(restored.lrc.includes('Matched lyrics'));
 console.log('通过：17岁/十七歲及繁简歌手匹配、同歌手姑娘/你的姑娘、缺失时才查歌手、精确结果优先、歧义保留、版本和歌手保护、可播验证、原始信息与来源名称持久化、地址刷新及歌词跟随实际录音。');
})().catch(e=>{console.error(e);process.exitCode=1;});
