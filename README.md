# 留声 · Liusheng Player

一个简洁的音乐播放器。基于 [CharlesPikachu/musicsquare](https://github.com/CharlesPikachu/musicsquare) 改造，保留多音源搜索、歌词、收藏和歌单管理，重新设计为浅色静态界面。

## 功能

- 网易云、QQ、酷我和 JOOX 音源搜索与播放。
- 收藏搜索、歌名/歌手排序、收藏 JSON 导出。
- JSON 歌单导入导出、自建歌单、一键同步收藏。
- 默认随机播放，记住模式、音量、歌曲及播放位置；浏览器限制自动播放时需点击播放。
- 桌面、平板和手机布局；去除粒子、水波纹和闪动背景。
- 收藏整理工具可逐首检查开头及中段播放，并搜索同歌名、同歌手的替代音源。

## GitHub Pages

将本仓库上传到 GitHub，在 **Settings → Pages → Deploy from a branch** 选择 `main` 分支的 `/(root)`。

前端为单个 `index.html`，无需 npm 安装或构建。`.nojekyll` 用于直接发布静态文件。

收藏、歌单和播放记录仅保存在当前浏览器。代码仓库不包含个人收藏或音频文件；换设备时通过 JSON 导出、导入迁移。

## 音源与代理

沿用原项目的公开接口：网易云使用 qijieya Meting，QQ 使用 tang music API，酷我使用 OIAPI。GitHub Pages 上的 QQ 搜索和详情请求默认直接访问同一个允许跨域的 QQ 接口；本地运行时使用 `server.py` 的同源代理。

代理不会提供平台未返回的播放地址，歌曲是否可播放仍取决于音源。QQ 导入条目缺少标识时，按歌名和歌手匹配，避免直接播放错误版本。

公开歌单**链接**导入需要兼容 `/api/playlist?url=...` 的服务。本地启动器已包含该能力。线上可在“音源设置”填写自己的 HTTPS 代理地址，接口约定与本仓库的 `server.py` 一致：

- `GET /api/qq?msg=歌名&mid=可选的QQ标识`：查询 QQ 搜索结果或歌曲详情。
- `GET /api/playlist?url=完整歌单链接`：返回本站可导入的歌单 JSON。

未配置代理时，线上仍可使用搜索、播放和 JSON 歌单导入导出。代理需允许对应 GitHub Pages 域名的 CORS 请求，不应提供任意 URL 转发。

## 本地运行

需要 Python 3，无第三方依赖：

```sh
python3 server.py
```

打开 `http://127.0.0.1:8766/`。本地服务仅监听回环地址，不向公网开放。

## 检查

需要 Node.js，无第三方依赖：

```sh
node tests/check_favorites_search.js
node tests/check_export_favorites.js
node tests/check_playback_resume.js
node tests/check_favorites_rebuild.js
node tests/check_api_routes.cjs
```

## 许可与来源

基于 Zhenchao Jin（CharlesPikachu）的 MusicSquare，遵循 Apache License 2.0。详见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。音乐内容和音源服务属于各自权利人；本项目不托管音乐文件。
