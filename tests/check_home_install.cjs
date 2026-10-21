const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
function element(){const node={children:[],handlers:{},addEventListener(key,fn){this.handlers[key]=fn;},appendChild(child){this.children.push(child);},showModal(){this.open=true;},close(){this.open=false;}};Object.defineProperty(node,'innerHTML',{set(){this.children=[];}});return node;}
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},events=new Map();
const c=vm.createContext({console,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,navigator:{userAgent:'iPhone',standalone:false},matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>events.set(name,fn),document:{addEventListener(){},getElementById:node,createElement:element},localStorage:{getItem(){return null;}}});
vm.runInContext(source.replace(/\}\)\(\);\s*$/,`showImportDialog=id=>$(id).showModal();showToast=text=>globalThis.toast=text;globalThis.app={setupHomeInstall,requestHomeInstall};})();`),c);
(async()=>{
 const a=c.app;a.setupHomeInstall();assert.equal(node('install-home-btn').hidden,false);await a.requestHomeInstall();assert(node('install-home-dialog').open);assert(node('install-home-steps').children.some(item=>item.textContent.includes('分享')));assert(node('install-home-steps').children.some(item=>item.textContent.includes('主屏幕')));
 node('install-home-close').handlers.click();assert(!node('install-home-dialog').open);
 c.navigator.userAgent='Android MicroMessenger';await a.requestHomeInstall();assert(node('install-home-steps').children[0].textContent.includes('浏览器中打开'));
 c.navigator.userAgent='Android Chrome';let calls=0,release;const choice=new Promise(resolve=>release=resolve);events.get('beforeinstallprompt')({preventDefault(){},prompt:async()=>{calls++;},userChoice:choice});const pending=a.requestHomeInstall();assert(node('install-home-btn').disabled);await a.requestHomeInstall();assert.equal(calls,1,'No double install prompts');release({outcome:'dismissed'});await pending;assert(!node('install-home-btn').disabled);assert(c.toast.includes('取消'));
 events.get('beforeinstallprompt')({preventDefault(){},prompt:async()=>{throw Error('Unavailable');},userChoice:Promise.resolve({outcome:'dismissed'})});await a.requestHomeInstall();assert(node('install-home-dialog').open);assert(!node('install-home-btn').disabled);
 events.get('beforeinstallprompt')({preventDefault(){},prompt:async()=>{calls++;},userChoice:Promise.resolve({outcome:'accepted'})});await a.requestHomeInstall();assert(c.toast.includes('系统提示'));events.get('appinstalled')();assert(node('install-home-btn').hidden);assert(!node('install-home-dialog').open);
 c.navigator.standalone=true;a.setupHomeInstall();assert(node('install-home-btn').hidden);const before=calls;await a.requestHomeInstall();assert.equal(calls,before);assert(c.toast.includes('已从桌面'));
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');
 for(const n of [180,192,512]){const png=fs.readFileSync(path.join(root,'icons',`icon-${n}.png`));assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),n);assert.equal(png.readUInt32BE(20),n);}
 assert(html.includes('rel="manifest"'));assert(html.includes('rel="apple-touch-icon"'));assert(html.includes('#shortcut-toggle-btn,.header-controls .shortcut-hint{display:none}'));
 console.log('通过：手机桌面安装提示、iOS及内置浏览器指引、重复点击/取消/失败/安装完成、桌面模式隐藏、清单相对路径与PNG图标尺寸、手机快捷键隐藏。');
})().catch(error=>{console.error(error);process.exitCode=1;});
