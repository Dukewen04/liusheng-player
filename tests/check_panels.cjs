const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
function boot(storage=new Map()){
  const classes=new Set(),nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{attrs:{},listeners:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;}});return nodes.get(id);};
  const classList={contains:k=>classes.has(k),toggle(k,on=!classes.has(k)){on?classes.add(k):classes.delete(k);}};
  const context=vm.createContext({console,AbortSignal,AbortController,URLSearchParams,
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    document:{body:{classList},getElementById:node,addEventListener(){}}});
  vm.runInContext(source.replace(/\}\)\(\);\s*$/,`globalThis.app={state,setupPanelToggles,updatePanelToggles};})();`),context);
  context.app.setupPanelToggles();
  return {app:context.app,node,classes,storage};
}
const first=boot(),search=first.node('search-panel-toggle'),music=first.node('music-panel-toggle');
assert.equal(search.attrs['aria-expanded'],'true');assert.equal(music.attrs['aria-expanded'],'true');
first.app.state.currentTrack={uid:'playing'};first.app.state.isPlaying=true;
const playback=JSON.stringify(first.app.state);
search.listeners.click();assert(first.classes.has('search-collapsed'));assert(!first.classes.has('music-collapsed'));
assert.equal(search.textContent,'展开');assert.equal(search.attrs['aria-expanded'],'false');
music.listeners.click();assert(first.classes.has('music-collapsed'));assert.equal(JSON.stringify(first.app.state),playback,'Collapsing leaves playback and library state untouched');
const restored=boot(first.storage);assert(restored.classes.has('search-collapsed'));assert(restored.classes.has('music-collapsed'));
restored.node('search-panel-toggle').listeners.click();assert(!restored.classes.has('search-collapsed'));assert(restored.classes.has('music-collapsed'));
restored.app.state.language='en';restored.app.updatePanelToggles();assert.equal(restored.node('music-panel-toggle').attrs['aria-label'],'Expand my music');
assert.equal(boot(new Map([['liusheng-panels-v1','broken']])).classes.size,0);
assert.equal(boot(new Map([['liusheng-panels-v1','{"search":"true","music":1}']])).classes.size,0);
for(const id of ['search-panel-content','music-panel-content','music-panel-tabs'])assert(html.includes(`id="${id}"`));
assert(html.includes('var(--search-width,260px)'));assert(html.includes('var(--music-width,minmax(420px,1.15fr))'));
console.log('通过：两侧独立收起/展开、刷新恢复、无效存储、双语无障碍标签、收起不影响播放或歌单。');
