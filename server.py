"""Local Liusheng server. Python standard library only."""
import json
import re
import sys
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

ROOT = Path(__file__).resolve().parent
PORT = 8766


def checked_playlist_url(link, hosts):
    url = urlsplit(link)
    if url.scheme not in ('http', 'https') or url.username or url.password or url.port or url.hostname not in hosts:
        raise ValueError('仅支持网易云和 QQ 音乐的歌单分享链接。')
    return url


class PlaylistRedirect(HTTPRedirectHandler):
    max_redirections = 4

    def redirect_request(self, request, response, code, message, headers, new_url):
        target = urljoin(request.full_url, new_url)
        checked_playlist_url(target, ('163cn.tv', 'music.163.com'))
        return super().redirect_request(request, response, code, message, headers, target)


def resolve_playlist_url(link):
    if len(link) > 2048:
        raise ValueError('歌单链接过长。')
    match = re.search(r'https?://[^\s<>"\']+', link)
    if not match:
        raise ValueError('请粘贴网易云或 QQ 音乐的歌单分享文字或链接。')
    link = match[0].rstrip('，。；！）)')
    url = checked_playlist_url(link, ('163cn.tv', 'music.163.com', 'y.qq.com', 'i.y.qq.com', 'i2.y.qq.com', 'c.y.qq.com'))
    if url.hostname == '163cn.tv':
        if not re.fullmatch(r'/[A-Za-z0-9_-]{1,64}/?', url.path):
            raise ValueError('网易云分享短链接格式无效。')
        opener = build_opener(PlaylistRedirect())
        with opener.open(Request(link, headers={'User-Agent': 'Mozilla/5.0'}), timeout=12) as response:
            link = response.url
        checked_playlist_url(link, ('music.163.com',))
    return link


def playlist_id(link):
    url = urlsplit(resolve_playlist_url(link))
    host = url.hostname
    path = url.path
    query = parse_qs(url.query)
    if host == 'music.163.com':
        fragment = urlsplit(url.fragment)
        if fragment.path:
            path = fragment.path
            query = parse_qs(fragment.query)
        source = 'netease'
        identifier = (query.get('id') or [''])[0] if 'playlist' in path else ''
    elif host in ('y.qq.com', 'i.y.qq.com', 'i2.y.qq.com', 'c.y.qq.com'):
        source = 'qq'
        identifier = (query.get('id') or query.get('disstid') or [''])[0]
        if not identifier:
            match = re.search(r'/playlist/(\d+)(?:/|$)', path)
            identifier = match[1] if match else ''
        if 'playlist' not in path and 'taoge' not in path:
            identifier = ''
    else:
        raise ValueError('仅支持网易云和 QQ 音乐歌单链接。')
    if not re.fullmatch(r'[0-9]{1,20}', identifier):
        raise ValueError('没有找到歌单 ID；请分享具体歌单，个人主页和“我喜欢”列表页不能直接导入。')
    return source, identifier


def fetch_json(url, referer):
    request = Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Referer': referer})
    with urlopen(request, timeout=20) as response:
        data = response.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise ValueError('平台返回的歌单过大，请拆分后导入。')
    return json.loads(data)


def library(source, identifier, data):
    if source == 'netease':
        if data.get('code') != 200:
            raise ValueError('网易云未开放这个歌单，请检查链接和公开设置。')
        playlist = data.get('result') or data.get('playlist') or {}
        raw_tracks = playlist.get('tracks') or []
        name, total = playlist.get('name'), playlist.get('trackCount')
    else:
        if data.get('code') != 0 or not data.get('cdlist'):
            raise ValueError('QQ 音乐未开放这个歌单，请检查链接和公开设置。')
        playlist = data['cdlist'][0]
        raw_tracks = playlist.get('songlist') or playlist.get('list') or []
        name, total = playlist.get('dissname'), playlist.get('total_song_num', playlist.get('songnum'))
    tracks = []
    for song in raw_tracks:
        if source == 'netease':
            song_id = str(song.get('id') or '')
            artists = song.get('artists') or song.get('ar') or []
            album = song.get('album') or song.get('al') or {}
            title = song.get('name') or ''
            cover = album.get('picUrl')
        else:
            song_id = str(song.get('songmid') or song.get('mid') or '')
            artists = song.get('singer') or []
            album = song.get('album') or {}
            title = song.get('songname') or song.get('name') or song.get('title') or ''
            album_mid = song.get('albummid') or album.get('mid')
            cover = f'https://y.gtimg.cn/music/photo_new/T002R300x300M000{album_mid}.jpg' if album_mid else None
        if not song_id:
            continue
        artist = ', '.join(a.get('name', '') for a in artists)
        track = {'uid': f'{source}-{song_id}', 'source': source, 'songid': song_id,
                 'title': title, 'artist': artist, 'album': song.get('albumname') or album.get('name', ''),
                 'cover': cover, 'keyword': f'{title} {artist}'.strip(), 'displayIndex': len(tracks) + 1}
        if source == 'qq':
            track.update(songMid=song_id, qqId=song_id)
        tracks.append(track)
    if not tracks:
        raise ValueError('歌单为空或当前无法读取。私有收藏需要平台授权，本站暂不支持账号同步。')
    total = int(total or len(tracks))
    warning = f'平台标示 {total} 首，本次读取 {len(tracks)} 首；导入结果不完整。' if total > len(tracks) else ''
    return {'version': 1, 'favorites': [], 'playlists': [{'id': f'{source}-playlist-{identifier}',
            'name': name or f'{source} 歌单 {identifier}', 'tracks': tracks}], 'warning': warning}


def get_playlist(link):
    source, identifier = playlist_id(link)
    if source == 'netease':
        referer = 'https://music.163.com/'
        data = fetch_json('https://music.163.com/api/v6/playlist/detail?' + urlencode({'id': identifier}), referer)
        if data.get('code') != 200:
            return library(source, identifier, data)
        playlist = data.get('playlist') or {}
        ids = [str(row.get('id')) for row in playlist.get('trackIds', []) if re.fullmatch(r'[0-9]{1,20}', str(row.get('id', '')))]
        if len(ids) > 10000:
            raise ValueError('歌单超过 10000 首，请拆分后导入。')
        songs = {str(song.get('id')): song for song in playlist.get('tracks', [])}
        missing = list(dict.fromkeys(identifier for identifier in ids if identifier not in songs))

        def song_batch(batch):
            url = 'https://music.163.com/api/song/detail?' + urlencode({'ids': json.dumps(batch, separators=(',', ':'))})
            result = fetch_json(url, referer)
            if result.get('code') != 200 or not isinstance(result.get('songs'), list):
                raise ValueError('歌曲资料读取不完整，请稍后重新导入。')
            return result['songs']

        # Playlist detail can return only a few songs; fetch the public IDs in batches.
        batches = [missing[index:index + 100] for index in range(0, len(missing), 100)]
        with ThreadPoolExecutor(max_workers=3) as pool:
            for batch in pool.map(song_batch, batches):
                songs.update((str(song.get('id')), song) for song in batch)
        if ids:
            playlist['tracks'] = [songs[song_id] for song_id in ids if song_id in songs]
        return library(source, identifier, data)
    else:
        url = 'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?' + urlencode({
            'disstid': identifier, 'type': 1, 'json': 1, 'utf8': 1, 'onlysong': 0, 'format': 'json'})
        referer = 'https://y.qq.com/'
    return library(source, identifier, fetch_json(url, referer))


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, body, content_type='application/json; charset=utf-8'):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.headers.get('Host') not in (f'127.0.0.1:{PORT}', f'localhost:{PORT}'):
            return self.respond(403, {'error': '仅允许本机访问。'})
        route = urlsplit(self.path)
        if route.path == '/api/health':
            return self.respond(200, {'service': 'liusheng-local'})
        if route.path == '/api/qq':
            if self.headers.get('Origin') not in (None, f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}'):
                return self.respond(403, {'error': '不允许跨站请求。'})
            params = parse_qs(route.query)
            msg = (params.get('msg') or [''])[0].strip()
            mid = (params.get('mid') or [''])[0]
            if not msg or len(msg) > 300 or (mid and not re.fullmatch(r'[A-Za-z0-9]{1,32}', mid)):
                return self.respond(400, {'error': '歌曲查询参数无效。'})
            query = {'msg': msg, 'type': 'json'}
            if mid:
                query['mid'] = mid
            try:
                return self.respond(200, fetch_json('https://tang.api.s01s.cn/music_open_api.php?' + urlencode(query), 'https://y.qq.com/'))
            except (HTTPError, URLError, TimeoutError, OSError, ValueError):
                return self.respond(502, {'error': 'QQ 音乐查询暂时失败，请稍后重试。'})
        if route.path == '/api/playlist':
            try:
                if self.headers.get('Origin') not in (None, f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}'):
                    return self.respond(403, {'error': '不允许跨站请求。'})
                link = (parse_qs(route.query).get('url') or [''])[0]
                return self.respond(200, get_playlist(link))
            except ValueError as error:
                return self.respond(400, {'error': str(error)})
            except (HTTPError, URLError, TimeoutError, OSError):
                return self.respond(502, {'error': '音乐平台暂时无法连接，请稍后重试。'})
            except (KeyError, TypeError, AttributeError):
                return self.respond(502, {'error': '平台数据格式变化，暂时无法导入。'})
        files = {'/': ('index.html', 'text/html; charset=utf-8'),
                 '/index.html': ('index.html', 'text/html; charset=utf-8'),
                 '/manifest.webmanifest': ('manifest.webmanifest', 'application/manifest+json'),
                 **{f'/icons/icon-{n}.png': (f'icons/icon-{n}.png', 'image/png') for n in (180, 192, 512)}}
        if route.path not in files:
            return self.respond(404, {'error': 'Not found'})
        name, content_type = files[route.path]
        return self.respond(200, (ROOT / name).read_bytes(), content_type)

    def log_message(self, format, *args):
        # Do not log playlist URLs or user identifiers.
        pass


if __name__ == '__main__':
    try:
        server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
        print(f'留声已启动：http://127.0.0.1:{PORT}（Ctrl+C 停止）', flush=True)
        if '--open' in sys.argv:
            webbrowser.open(f'http://127.0.0.1:{PORT}')
        server.serve_forever()
    except KeyboardInterrupt:
        pass
