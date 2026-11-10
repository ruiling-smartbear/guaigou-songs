# 怪狗唱片

给家里长辈用的小网站：讲一个故事（可以直接说话），或者在 iPad 上画一幅画，DeepSeek 把它写成歌词。你在 Suno 里手动生成，再把 mp3 传回来，长辈凭编号收听和下载。

```
docs/      网页（GitHub Pages）：长辈端 index.html，你的待做清单 admin.html
worker/    后端（Cloudflare Worker + R2）：保管 API key、写歌词、存画和 mp3
```

## 本地试用

```bash
cp .dev.vars.example .dev.vars   # MOCK=1 时不需要 key，歌词是假的
node dev-server.mjs 8791
```

- 长辈端：http://localhost:8791/?k=wangwang&name=姥姥
- 待做清单：http://localhost:8791/admin.html （口令 `dev-admin`）

## 上线

### 1. 后端：Cloudflare（免费额度足够）

```bash
cd worker
npx wrangler login
npx wrangler r2 bucket create guaigou-songs
npx wrangler secret put DEEPSEEK_API_KEY   # 你的 DeepSeek key
npx wrangler secret put FAMILY_KEY         # 家里的暗号，长辈链接里用
npx wrangler secret put ADMIN_TOKEN        # 你自己的管理口令，设长一点
npx wrangler deploy
```

部署完会给你一个地址，比如 `https://guaigou-songs.xxx.workers.dev`。

### 2. 网页：GitHub Pages

1. 把 `docs/config.js` 里的 `apiBase` 改成上面的 Worker 地址。
2. 把整个文件夹推到 GitHub 仓库，然后打开 Settings → Pages，选择 `main` 分支的 `/docs` 目录。
3. 回到 `worker/wrangler.toml`，把 `ALLOWED_ORIGINS` 改成你的 Pages 地址（比如 `https://yourname.github.io`），再运行一次 `npx wrangler deploy`。

仓库公开也没关系：故事、画和歌都存在 R2 里，不在仓库里；key 存在 Cloudflare secret 里。

### 3. 发给长辈

每人发一个专属链接，打开一次就会记住：

```
https://yourname.github.io/guaigou-songs/?k=家里暗号&name=姥姥
```

在 iPad 的 Safari 里点「分享 → 添加到主屏幕」，之后就像一个 App。

## 取歌号码和公开

- 每首歌提交后会拿到一个随机的 3 位取歌号码，比如 `795`。在首页输入号码就能打开这首歌。号码是随机发的，不会按 1、2、3 顺着被翻到。3 位只有 900 个，有人存心一个个试还是能试出来，家里用够了；介意的话把 `worker/src/index.js` 里 `newCode` 的起始位数改成 4。
- 提交时可以勾选「公开到大家的歌」，之后也能在歌曲页随时打开或关闭。公开的歌只会显示歌名和名字，不会显示取歌号码。
- 歌曲页可以「用照片当封面」，封面优先级：照片 > 画 > 小狗头像。

## 风格

一共 53 种，分成 7 类。要增删风格，改 `tools/styles.py`，然后运行 `python3 tools/styles.py`，它会同时更新后端和网页。

## 每天的流程

1. 打开 `admin.html`，「待做」里是长辈们提交的歌。
2. 每首歌都有三个「复制」按钮，分别对应 Suno Custom 模式的 Title、Style of Music 和 Lyrics。
3. 在 Suno 生成并下载 mp3。
4. 把 mp3 拖到对应的卡片上；或者先把文件改名成以卡片左上角的序号开头（比如 `12.mp3`），再一次性拖进最上面的批量框。
5. 长辈那边会自动显示播放和下载按钮。

## 自动上传（不用再手动拖 mp3）

在你自己的电脑上开着这个小程序，它会盯着「下载」文件夹。Suno 的歌一下载完，它就按文件名里的歌名对上那首待做的歌，自动传上去。

```bash
GG_API=https://你的worker地址 GG_ADMIN_TOKEN=你的管理口令 node tools/auto-upload.mjs
```

- 文件名保持 Suno 给的歌名就行（`歌名.mp3`、`歌名 (1).mp3` 都认）。
- 两首待做的歌重名时，把文件名改成以序号开头，比如 `12 歌名.mp3`。
- Suno 一次给两版，先下载的那版会被用上，第二版自动跳过。
- 只读不删：它不会移动或删除你下载文件夹里的任何东西。
- 本地试用时不用带那两个变量，默认连 `http://localhost:8791`。

## 让别的工具接手「生成音乐」这一步

如果中间那一步交给别的工具做，它只需要两件事：

1. 取任务：`node tools/next-job.mjs --wait`。有新请求就打印一段 JSON（`title` 歌名、`style` 风格、`lyrics` 歌词、`saveAs` 建议文件名），没有就一直等。每首歌只发一次；想重新发，运行 `node tools/next-job.mjs --reset`。
2. 交回：把做好的音频按 `saveAs` 的名字存进「下载」文件夹，`tools/auto-upload.mjs` 会自动传给对应的歌。

线上使用时，两个命令前面都带上 `GG_API=... GG_ADMIN_TOKEN=...`。

## 可以调的地方（`worker/wrangler.toml`）

- `DAILY_LYRICS_LIMIT` / `DAILY_SONG_LIMIT`：每天最多生成多少次歌词、提交多少首歌，防止账单失控。
- `DEEPSEEK_MODEL`：默认 `deepseek-chat`。
- 读画（可选）：DeepSeek 看不懂图片。如果想让 AI 直接看懂画，可以配一个兼容 OpenAI 接口的视觉模型（比如通义千问 VL）：设置 `VISION_BASE_URL`、`VISION_MODEL`，再运行 `wrangler secret put VISION_API_KEY`。不配也能用，长辈说一句「画的是什么」就行。

## 语音输入

用的是浏览器自带的语音识别（iPad Safari 支持）。第一次会请求麦克风权限；iPad 需要在「设置 → 通用 → 键盘」里打开「听写」。如果浏览器不支持，按钮会提示改用键盘上的 🎤。
