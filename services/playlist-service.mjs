const PLAYERS = new Set(['https://dukewen04.github.io', 'http://127.0.0.1:8766', 'http://localhost:8766']);
const HOSTS = new Set(['163cn.tv', 'music.163.com', 'y.qq.com', 'i.y.qq.com', 'i2.y.qq.com', 'c.y.qq.com']);

function checkedURL(raw) {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || !HOSTS.has(url.hostname)) throw Error('仅支持网易云或 QQ 的歌单分享链接。');
  return url;
}
async function request(url, signal, fetcher, extra = {}) {
  const response = await fetcher(url, {signal, redirect:'manual', headers:{'User-Agent':'Mozilla/5.0', Referer:'https://music.163.com/'}, ...extra});
  if (!response.ok) throw Error('音乐平台暂时无法连接，请稍后重试。');
  return response;
}
async function json(url, signal, fetcher) {
  const response = await request(url, signal, fetcher);
  const text = await response.text();
  if (text.length > 8 * 1024 * 1024) throw Error('平台返回的歌单过大，请拆分后导入。');
  try { return JSON.parse(text); } catch { throw Error('音乐平台返回了无效资料，请稍后重试。'); }
}
export async function resolvePlaylist(raw, signal, fetcher = fetch) {
  if (typeof raw !== 'string' || raw.length > 2048) throw Error('歌单链接格式无效。');
  const match = raw.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) throw Error('请粘贴完整歌单链接或分享文字。');
  let url = checkedURL(match[0].replace(/[，。；！）)]+$/, ''));
  if (url.hostname === '163cn.tv') {
    if (!/^\/[A-Za-z0-9_-]{1,64}\/?$/.test(url.pathname)) throw Error('网易云短链接格式无效。');
    let resolved = false;
    for (let hops = 0; hops < 4; hops++) {
      const response = await fetcher(url.href, {signal, redirect:'manual', headers:{'User-Agent':'Mozilla/5.0'}});
      if (response.status < 300 || response.status >= 400) { await response.body?.cancel(); break; }
      const location = response.headers.get('Location');
      await response.body?.cancel();
      if (!location) break;
      url = checkedURL(new URL(location, url).href);
      if (!['163cn.tv', 'music.163.com'].includes(url.hostname)) throw Error('网易云短链接跳转地址无效。');
      if (url.hostname === 'music.163.com') { resolved = true; break; }
    }
    if (!resolved) throw Error('网易云短链接未能展开，请检查链接是否有效。');
  }
  const netease = url.hostname === 'music.163.com';
  const page = netease && url.hash ? new URL(url.hash.slice(1), url.origin) : url;
  const id = /playlist|taoge/.test(page.pathname) ? page.searchParams.get('id') || page.searchParams.get('disstid') || page.pathname.match(/playlist\/(\d+)/)?.[1] : null;
  if (!/^\d{1,20}$/.test(id || '')) throw Error('没有找到歌单 ID，请分享具体歌单。');
  return {source:netease?'netease':'qq', id};
}
export async function loadPlaylist(raw, signal, fetcher = fetch) {
  const {source,id} = await resolvePlaylist(raw, signal, fetcher);
  let name, tracks;
  if (source === 'netease') {
    const detail = await json('https://music.163.com/api/v6/playlist/detail?' + new URLSearchParams({id}), signal, fetcher);
    if (detail.code !== 200 || !detail.playlist) throw Error('网易云未开放这个歌单，请检查公开设置。');
    const list = detail.playlist;
    name = list.name;
    const ids = [...new Set((list.trackIds || []).map(row => String(row.id)))];
    if (ids.some(id => !/^\d{1,20}$/.test(id)) || ids.length > 10000 || Number(list.trackCount) > 10000) throw Error('歌单资料无效或超过 10000 首，请拆分后导入。');
    const songs = new Map((list.tracks || []).map(song => [String(song.id),song]));
    const missing = ids.filter(id => !songs.has(id));
    let next = 0;
    await Promise.all(Array.from({length:Math.min(3, Math.ceil(missing.length / 100))}, async () => {
      while (next < missing.length) {
        const batch = missing.slice(next, next += 100);
        const data = await json('https://music.163.com/api/song/detail?' + new URLSearchParams({ids:JSON.stringify(batch)}), signal, fetcher);
        if (data.code !== 200 || !Array.isArray(data.songs)) throw Error('网易云歌曲资料读取不完整，请稍后重试。');
        data.songs.forEach(song => songs.set(String(song.id),song));
      }
    }));
    const ordered = ids.length ? ids.map(id => songs.get(id)) : [...songs.values()];
    if (ordered.some(song => !song) || Number(list.trackCount || 0) > ordered.length) throw Error('网易云歌曲资料读取不完整，未导入部分歌单，请稍后重试。');
    tracks = ordered.map((song,index) => ({uid:'netease-'+song.id, source, songid:String(song.id), title:song.name, artist:(song.ar || song.artists || []).map(a => a.name).join('/'), album:(song.al || song.album)?.name || '', displayIndex:index+1}));
  } else {
    const rows = await json('https://api.qijieya.cn/meting/?' + new URLSearchParams({server:'tencent',type:'playlist',id}), signal, fetcher);
    if (!Array.isArray(rows) || !rows.length || rows.length > 10000) throw Error('QQ 歌单为空或未开放，请检查公开设置。');
    tracks = rows.map((row,index) => {
      const link = new URL(row.url);
      if (link.origin !== 'https://api.qijieya.cn' || link.pathname !== '/meting/' || link.searchParams.get('server') !== 'tencent' || link.searchParams.get('type') !== 'url') throw Error('QQ 歌曲标识无效。');
      const mid = link.searchParams.get('id');
      if (!/^[A-Za-z0-9]{1,32}$/.test(mid || '')) throw Error('QQ 歌曲标识无效。');
      return {uid:'qq-'+mid,source,songid:mid,qqId:mid,songMid:mid,title:row.name,artist:row.artist,displayIndex:index+1};
    });
    name = 'QQ 歌单 ' + id;
  }
  if (!tracks.length || tracks.some(song => typeof song.title !== 'string' || !song.title.trim() || typeof song.artist !== 'string')) throw Error('歌单歌曲资料不完整，请稍后重试。');
  return {version:1,favorites:[],playlists:[{id:source+'-playlist-'+id,name:name || '网易云歌单 '+id,tracks}],warning:''};
}
export async function handlePlaylist(request, fetcher = fetch) {
  const origin = request.headers.get('Origin');
  const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
  if (origin && !PLAYERS.has(origin)) return new Response(JSON.stringify({error:'不允许跨站请求。'}),{status:403,headers});
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS'}});
  if (request.method !== 'GET') return new Response(null,{status:405,headers});
  try {
    const signal = AbortSignal.any([request.signal,AbortSignal.timeout(25000)]);
    const data = await loadPlaylist(new URL(request.url).searchParams.get('url') || '', signal, fetcher);
    return new Response(JSON.stringify(data),{headers});
  } catch (error) {
    const message = ['TimeoutError','AbortError'].includes(error.name) ? '歌单读取超时，请稍后重试。' : error.message || '歌单读取失败，请稍后重试。';
    return new Response(JSON.stringify({error:message}),{status:502,headers});
  }
}
