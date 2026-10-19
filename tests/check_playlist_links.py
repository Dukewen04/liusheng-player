"""Public fixtures only: no personal playlists or account data."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request
import json

spec = importlib.util.spec_from_file_location('player', Path(__file__).resolve().parents[1] / 'server.py')
player = importlib.util.module_from_spec(spec)
spec.loader.exec_module(player)


class PlaylistTests(unittest.TestCase):
    def test_full_share_and_qq(self):
        self.assertEqual(player.playlist_id('分享歌单: 示例 https://music.163.com/#/playlist?id=123 (@网易云音乐)'), ('netease', '123'))
        self.assertEqual(player.playlist_id('https://y.qq.com/n/ryqq_v2/playlist/456'), ('qq', '456'))
        self.assertEqual(player.playlist_id('分享歌单 https://i2.y.qq.com/n3/other/pages/details/playlist.html?hosteuin=example**&id=456&appshare=iphone_wx'), ('qq', '456'))

    def test_short_share(self):
        response = MagicMock()
        response.__enter__.return_value.url = 'https://music.163.com/playlist?id=123&userid=456'
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(player, 'build_opener', return_value=opener):
            self.assertEqual(player.playlist_id('分享歌单: 示例 https://163cn.tv/Example (@网易云音乐)'), ('netease', '123'))
        self.assertEqual(opener.open.call_args.args[0].full_url, 'https://163cn.tv/Example')

    def test_reject_unsafe_or_non_playlist_links(self):
        for link in ('https://music.163.com.evil.test/playlist?id=1',
                     'https://user:pass@music.163.com/playlist?id=1',
                     'https://music.163.com:8766/playlist?id=1',
                     'https://127.0.0.1/playlist?id=1',
                     'https://163cn.tv/a/b', 'file:///etc/passwd',
                     'https://y.qq.com/n/ryqq_v2/profile/like/song',
                     'https://music.163.com/playlist?id=bad'):
            with self.subTest(link=link), self.assertRaises(ValueError):
                player.playlist_id(link)

    def test_mobile_qq_uses_only_playlist_id(self):
        data = {'code': 0, 'cdlist': [{'dissname': 'Example', 'total_song_num': 1,
                'songlist': [{'songmid': 'abc123', 'songname': 'Song', 'singer': [{'name': 'Singer'}]}]}]}
        with patch.object(player, 'fetch_json', return_value=data) as fetch:
            result = player.get_playlist('https://i2.y.qq.com/n3/other/pages/details/playlist.html?hosteuin=example**&id=456')
        self.assertNotIn('hosteuin', fetch.call_args.args[0])
        self.assertEqual(parse_qs(urlsplit(fetch.call_args.args[0]).query)['disstid'], ['456'])
        self.assertEqual(result['playlists'][0]['tracks'][0]['songMid'], 'abc123')

    def test_reject_redirect_outside_music_hosts(self):
        handler = player.PlaylistRedirect()
        request = Request('https://163cn.tv/Example')
        for target in ('http://127.0.0.1/', 'https://evil.test/', 'https://music.163.com:8766/', 'https://user@music.163.com/'):
            with self.subTest(target=target), self.assertRaises(ValueError):
                handler.redirect_request(request, None, 302, '', {}, target)

    def test_complete_ids_in_batches_and_original_order(self):
        ids = list(range(205, 0, -1))
        sizes = []

        def song(identifier):
            return {'id': identifier, 'name': f'Song {identifier}', 'ar': [{'name': 'Singer'}]}

        def fetch(url, referer):
            if '/v6/' in url:
                return {'code': 200, 'playlist': {'name': 'Example', 'trackCount': len(ids),
                        'trackIds': [{'id': i} for i in ids], 'tracks': [song(ids[0])]}}
            batch = json.loads(parse_qs(urlsplit(url).query)['ids'][0])
            sizes.append(len(batch))
            return {'code': 200, 'songs': [song(int(i)) for i in reversed(batch)]}

        with patch.object(player, 'fetch_json', side_effect=fetch):
            data = player.get_playlist('https://music.163.com/playlist?id=123')
        self.assertEqual(sorted(sizes), [4, 100, 100])
        self.assertEqual([int(t['songid']) for t in data['playlists'][0]['tracks']], ids)
        self.assertFalse(data['warning'])

    def test_incomplete_data_warning_and_failure(self):
        first = {'code': 200, 'playlist': {'trackCount': 2, 'trackIds': [{'id': 1}, {'id': 2}],
                 'tracks': [{'id': 1, 'name': 'Song'}]}}
        with patch.object(player, 'fetch_json', side_effect=[first, {'code': 200, 'songs': []}]):
            data = player.get_playlist('https://music.163.com/playlist?id=123')
        self.assertIn('不完整', data['warning'])
        with patch.object(player, 'fetch_json', side_effect=[first, {'code': 500}]):
            with self.assertRaisesRegex(ValueError, '资料读取不完整'):
                player.get_playlist('https://music.163.com/playlist?id=123')
        with patch.object(player, 'fetch_json', return_value={'code': 403}):
            with self.assertRaisesRegex(ValueError, '未开放'):
                player.get_playlist('https://music.163.com/playlist?id=123')


if __name__ == '__main__':
    unittest.main()
