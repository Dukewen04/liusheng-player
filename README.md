# 留声 · Liusheng Player

一个简洁的音乐播放器。基于 [CharlesPikachu/musicsquare](https://github.com/CharlesPikachu/musicsquare) 改造，保留多音源搜索、歌词、收藏和歌单管理，重新设计为浅色静态界面。

## 功能

- 网易云、QQ、酷我、JOOX 和酷狗音源搜索与播放，默认全部勾选。搜索结果先以最多 4 路并发检查播放地址及浏览器能否加载音频，只显示通过检查的歌曲，并显示已过滤数量；新搜索会取消旧检查，不打断当前播放。
- 统一使用本地内嵌的 Lucide 线条图标；音质标签提供中文名称和说明，不再将未知码率一律标为 320K。
- 收藏搜索、歌名/歌手排序、收藏 JSON 导出。
- 歌曲搜索和“我的音乐”可分别收起、展开，自动记住状态；收起后播放器使用腾出的空间。
- 播放时自动补全歌词：优先原平台，再匹配同歌名、歌手和版本的备用歌词；支持纯文本和滚动歌词，后台查询不阻塞播放。
- 播放器右上角可切换「纯净模式」：大字居中歌词，保留进度、切歌和音量；点击退出或按 Esc 返回，刷新后记住显示模式。
- JSON 歌单导入导出、自建歌单、一键同步收藏。导入入口提供网易云 / QQ 取链接指引和 JSON 文件指引、格式示例下载、5 MB 文件校验及预览确认。
- 默认随机播放，记住模式、音量、歌曲及播放位置；浏览器限制自动播放时需点击播放。
- 桌面、平板和手机布局；去除粒子、水波纹和闪动背景。
- 收藏整理工具可逐首检查开头及中段播放，并搜索同歌名、同歌手的替代音源。
- 音源连接失败会明确提示；短暂网络错误自动重试一次。播放失败后可直接点击播放刷新地址并保留进度，解码失败时优先使用兼容音质。

## GitHub Pages

将本仓库上传到 GitHub，在 **Settings → Pages → Deploy from a branch** 选择 `main` 分支的 `/(root)`。

前端为单个 `index.html`，无需 npm 安装或构建。`.nojekyll` 用于直接发布静态文件。

收藏、歌单和播放记录仅保存在当前浏览器。代码仓库不包含个人收藏或音频文件；换设备时通过 JSON 导出、导入迁移。

## 音源与代理

沿用原项目的公开接口：网易云使用 qijieya Meting，QQ 使用 tang music API，酷我使用 OIAPI。GitHub Pages 上的 QQ 搜索和详情请求默认直接访问同一个允许跨域的 QQ 接口；本地运行时使用 `server.py` 的同源代理。

代理不会提供平台未返回的播放地址，歌曲是否可播放仍取决于音源。QQ 导入条目缺少标识时，按歌名和歌手匹配，避免直接播放错误版本。

播放地址统一使用 HTTPS，临时地址最多缓存 10 分钟。酷我收藏每次刷新地址时先按歌曲 ID、歌名和歌手重新定位，避免搜索排序变化后播放其他歌曲。QQ 没有返回播放地址时明确报错，不会把空地址算作成功。

如果多个音源同时连接失败，尤其浏览器显示 `ERR_CONNECTION_CLOSED`，请检查系统代理或网络路由：网页能打开不代表音乐 API 和 CDN 可达。可以按实际网络情况为音乐域名设置直连例外；不需要关闭 HTTPS 校验或降低浏览器安全设置。

酷我歌词使用官方歌曲 ID 接口，缺失时尝试网易云和 QQ 的匹配歌词。补全歌词不会替换播放音源；纯文本歌词会明确标注没有时间轴。最近 80 首歌词保存在当前浏览器的独立缓存中，大小限制为约 18 万字符；纯音乐或接口没有返回的歌词仍可能无法补齐。

公开歌单**链接**导入需要兼容 `/api/playlist?url=...` 的服务。本地启动器已包含该能力。线上可在“音源设置”填写自己的 HTTPS 代理地址，接口约定与本仓库的 `server.py` 一致：

- `GET /api/qq?msg=歌名&mid=可选的QQ标识`：查询 QQ 搜索结果或歌曲详情。
- `GET /api/playlist?url=完整歌单链接或分享文字`：返回本站可导入的歌单 JSON。网易云支持整段“分享歌单: … https://163cn.tv/… (@网易云音乐)”：服务端只在网易云域名内展开短链接，读取全部歌曲 ID 并按原顺序分批补齐资料；未能读全时明确显示警告。

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
node tests/check_lyrics.cjs
node tests/check_playback_recovery.cjs
node tests/check_panels.cjs
node tests/check_icons.cjs
node tests/check_import_guide.cjs
node tests/check_sources.cjs
node tests/check_playable_search.cjs
python3 tests/check_playlist_links.py
```

## 许可与来源

基于 Zhenchao Jin（CharlesPikachu）的 MusicSquare，遵循 Apache License 2.0。详见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。音乐内容和音源服务属于各自权利人；本项目不托管音乐文件。

图标来自 [Lucide](https://lucide.dev)，仅内嵌用到的 SVG，无外部图标 CDN 请求；许可见 NOTICE 和 index.html 中的图标许可声明。

导入指引会提前区分当前环境：本地可直接读取平台公开歌单；GitHub Pages 的链接导入仍需配置兼容服务。文件导入在浏览器内完成，不上传文件，确认后合并已有内容。页面底部仅显示音乐版权归属，项目及第三方许可声明保留在 LICENSE / NOTICE。

酷狗搜索与详情使用 apicx 的公开音乐接口，播放时重新按 Hash 定位并校验歌名和歌手；JOOX 同样按稳定 ID 重新定位，优先浏览器兼容的 MP3。新增音源以实际取得音频为准；本次咪咕的播放地址返回 JSON，未加入。

搜索的可播放检查使用独立静音音频元素，不会播放声音；无地址、加载失败、浏览器不能解码或超过检查时限的条目暂不显示。检查仅反映当前网络和音源状态，播放地址后续仍可能过期；只检查能否加载有效音频，不保证整首播放或排除平台试听。歌单导入保留平台列表，不因搜索筛选而丢弃歌曲。
