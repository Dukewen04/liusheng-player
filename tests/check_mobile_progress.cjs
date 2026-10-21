const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
let now=0;class Clock extends Date{static now(){return now;}}
const nodes=new Map(),storage=new Map(),timers=new Map(),events=new Map();let timerId=0;
const node=id=>{if(!nodes.has(id))nodes.set(id,{classList:{items:new Set(),toggle(key){if(this.items.has(key)){this.items.delete(key);return false;}this.items.add(key);return true;}},attrs:{},listeners:{},textContent:'',style:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},close(){},showModal(){},removeAttribute(){}});return nodes.get(id);};
const c=vm.createContext({console,Date:Clock,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,
 setInterval:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id),
 document:{body:{dataset:{}},visibilityState:'visible',getElementById:node,addEventListener(){},querySelectorAll:()=>[]},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`
 showImportDialog=()=>{};
 dom.audio={addEventListener:(event,fn)=>globalThis.events.set(event,fn)};
 togglePlayPause=()=>globalThis.toggled=true;
 findBestImportRecording=async track=>({...track,uid:'kuwo-'+track.uid,source:'kuwo'});
 globalThis.app={state,toggleLibraryActions,setupMobileNavigation,setMobileView,updateMobilePlayback,createImportProgress,importActiveLines,verifyImportData,runPlaylistImport,stop:()=>importController.abort()};
})();`),Object.assign(c,{events}));
const a=c.app,tick=()=>{for(const fn of [...timers.values()])fn();};
(async()=>{
 a.setupMobileNavigation();assert.equal(c.document.body.dataset.mobileView,'player');
 a.state.currentTrack={uid:'current',title:'雨',artist:'沈以诚'};a.state.isPlaying=true;
 const before=JSON.stringify(a.state);node('mobile-nav-search').listeners.click();assert.equal(c.document.body.dataset.mobileView,'search');assert.equal(JSON.stringify(a.state),before,'Switching screens leaves playback and library untouched');
 assert.equal(node('mobile-nav-search').attrs['aria-pressed'],'true');assert.equal(node('mobile-nav-player').attrs['aria-pressed'],'false');
 events.get('play')();assert(!node('mobile-now-playing').hidden);assert.equal(node('mobile-current-title').textContent,'雨');assert(node('mobile-toggle-play').innerHTML.includes('#icon-pause'));
 node('mobile-toggle-play').listeners.click();assert(c.toggled);node('mobile-current-track').listeners.click();assert.equal(c.document.body.dataset.mobileView,'player');
 a.setMobileView('music');a.setupMobileNavigation();assert.equal(c.document.body.dataset.mobileView,'music','Restore the last screen');a.setMobileView('invalid');assert.equal(c.document.body.dataset.mobileView,'music');
 for(const type of ['favorites','playlist']){
  const snapshot=JSON.stringify(a.state);a.toggleLibraryActions(type);assert.equal(node(type+'-actions-toggle').attrs['aria-expanded'],'true');assert(node(type+'-more-actions').classList.items.has('mobile-open'));
  a.toggleLibraryActions(type);assert.equal(node(type+'-actions-toggle').attrs['aria-expanded'],'false');assert(!node(type+'-more-actions').classList.items.has('mobile-open'));assert.equal(JSON.stringify(a.state),snapshot,'Opening tools must not change songs or playback');
 }
 assert(html.includes('.playlist-panel .playlist-bar{position:static;'));
 assert(html.includes('.playlist-panel .mobile-library-actions:not(.mobile-open){display:none}'));
 assert(html.includes('.favorites-search-controls{display:grid;'));
 let renders=0;const ui=a.createImportProgress(0);ui.update(()=>{renders++;node('stage').textContent=a.importActiveLines({active:['等待接口'],activeSince:[0]});});
 for(let i=0;i<1000;i++)ui.update(()=>{renders++;node('stage').textContent=a.importActiveLines({active:['等待接口'],activeSince:[0]});});
 assert.equal(renders,1,'Frequent worker callbacks do not synchronously rewrite the DOM');now=250;tick();assert.equal(renders,2);
 now=5250;tick();assert.equal(node('import-elapsed-clock').textContent,'用时 00:05');assert(node('stage').textContent.includes('5 秒'),'Stage wait continues while the API is pending');
 now=90500;tick();assert.equal(node('import-elapsed-clock').textContent,'用时 01:30','Use wall time after background throttling');ui.flush();node('stage').textContent='完成';tick();assert.equal(node('stage').textContent,'完成');ui.stop();assert.equal(timers.size,0);
 const pending=a.runPlaylistImport(signal=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason))),node('status'));
 now+=8000;tick();assert.equal(node('import-elapsed-clock').textContent,'用时 00:08','The reading phase has an independent live clock too');assert.equal(node('import-check-count').textContent,'正在读取歌曲总数…');a.stop();assert.equal(await pending,false);assert.equal(timers.size,0,'Stop and failure release the timer');assert(node('import-check-status').textContent.includes('已取消导入'));
 let checked=0,yieldedAt=-1;setTimeout(()=>{yieldedAt=checked;},0);
 const tracks=Array.from({length:40},(_,i)=>({uid:String(i),title:'Song '+i,artist:'Singer',source:'qq'}));
 const result=await a.verifyImportData({favorites:tracks,playlists:[]},new AbortController(),stats=>{checked=stats.checked;},{compareAll:false,workers:1});
 assert.equal(result.stats.checked,40);assert(yieldedAt>0&&yieldedAt<40,'Instant cached results yield to the browser between songs');
 for(const view of ['search','player','music'])assert(html.includes(`[data-mobile-view="${view}"] .layout>`));
 assert(html.includes('safe-area-inset-bottom'));assert(html.includes('body:not(.lyrics-mode) .mobile-dock'));assert(html.includes('body:not(.lyrics-mode) .search-panel-content{display:flex'));
 console.log('通过：手机三入口及页面恢复、切换不影响播放、迷你播放控制、独立实时用时及阶段等待、进度更新节流、后台时间校正、停止释放计时器、缓存任务让出主线程。');
})().catch(error=>{console.error(error);process.exitCode=1;});
