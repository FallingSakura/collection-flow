# Collection Flow

> 把 B 站「稍后再看」变成一个你真的会刷的信息流。<br>
> Turn your bilibili "watch later" backlog into a feed you'll actually scroll.

[简体中文](#简体中文) · [English](#english)

---

## 简体中文

### 为什么做这个

用 B 站的时候我总把视频丢进「稍后再看」，不知不觉就攒了几百个，然后完全不知道该从哪个开始看。于是做了这个小工具：把稍后再看当成一个视频流，像刷推荐一样一屏一屏往下刷。

这样做有两个好处：一是能把越积越多的列表慢慢清掉，二是因为流里的每一条都是自己当初真正感兴趣、特意存下来的，而不是在算法随机生成的推荐流里漫无目的地刷。

### 功能

- **稍后再看 → 信息流**：粘贴一次 Cookie 后，列表以卡片流展示，滚到底自动加载更多（每页 10 个）。
- **默认乱序且稳定**：初始顺序由 Cookie 派生的伪随机序决定——看起来是打乱的，但每次打开都一样，不会看一半顺序全变；点 Shuffle 才会真正重排。
- **边刷边删**：删除立即从列表消失（乐观更新），连续删除会合并成一个批量请求；失败时视频自动恢复并给出提示。
- **本地缓存**：列表、顺序和上次同步时间按 Cookie 哈希分桶存在 localStorage 里，24 小时内直接读缓存，过期才请求 B 站。
- **设置面板**：单列/双列布局、浅色/深色主题和 Cookie 都在这里管理，顶部显示上次成功同步的时间。
- **封面代理**：B 站的图片 CDN 会校验 Referer，封面统一由后端代理加载。

### 隐私

Cookie 只存在你自己的浏览器里，每次请求通过 `x-bili-cookie` 头带给后端，后端仅用于当次转发给 B 站，不落库、不记录。项目没有数据库，服务端不保存任何账号信息。

需要知道的是：Cookie 以明文存在浏览器的 localStorage（键名 `bili-cookie`），本页面上运行的任何脚本和有权限的浏览器扩展都能读到它。列表缓存的键名用的是 Cookie 的哈希，只是为了不把 Cookie 再复制几份，并不能让它更安全。另外，后端在转发时必然能看到 Cookie——如果你不想信任别人部署的实例，请自己部署一份。

### 技术栈与结构

- `client/` — React 19 + Vite + Tailwind CSS 4；TanStack Query 只作为请求原语使用，缓存与刷新策略都在 `useVideos` 里。
- `server/` — Express 5 + TypeScript，以单个 Vercel Function 运行，只做 B 站接口的薄代理。
- 两个独立的 pnpm 包，各自持有 lockfile；仓库根目录只放工具链（husky / lint-staged / prettier）。

### API

| 端点 | 作用 |
| --- | --- |
| `GET /api/videos` | 拉取并规范化稍后再看列表 |
| `POST /api/videos/delete` | 按 aid 批量删除（B 站接口需要 Cookie 中的 `bili_jct` 作为 csrf） |
| `GET /api/cover?url=` | 封面代理，只允许 `*.hdslb.com` 的地址 |

后端只响应 `Origin` 或 `Referer` 属于允许前端源（`FRONTEND_URL`，支持逗号分隔的多个源）或 localhost 的请求。这能阻止其他网站在访客的浏览器里调用这个 API，但这两个请求头可以被 curl 之类的工具伪造，所以它不是身份认证。

### 本地开发

```bash
pnpm install
pnpm -C server install
pnpm -C client install

cp server/.env.example server/.env
pnpm -C server dev   # API：http://localhost:3000
pnpm -C client dev   # 前端：http://localhost:5173，/api 自动代理到后端
```

### 部署（Vercel）

从同一个仓库创建两个项目：

- **API** — Root Directory 设为 `server`，环境变量 `FRONTEND_URL` 填允许的前端源（可逗号分隔多个）。不需要 `vercel.json`：Vercel 会自动识别 `server.ts` 里的 Express 应用。
- **前端** — Root Directory 设为 `client`，环境变量 `VITE_API_URL` 填 API 的地址。

### 说明

这是一个非官方的个人工具，与 B 站官方无关。Cookie 等同于账号凭证，请只在可信环境里使用；删除操作会以你账号的权限执行，请确认后再删。

---

## English

### Why

I kept saving videos to bilibili's watch later list and never watching them. Before I noticed, it had grown to hundreds, and the bigger it got, the less I knew where to start. So I built this: the watch later list as a feed you scroll one screen at a time.

Two things come out of that. You slowly work through the backlog, and everything in the feed is something past-you deliberately saved, rather than whatever a recommendation algorithm picked for you.

### Features

- **Watch later as a feed** — paste your cookie once; the list becomes a card feed that loads more as you reach the bottom (10 per page).
- **Shuffled but stable** — the initial order is a pseudo-random order seeded by your cookie: it looks shuffled, but comes out the same on every visit, so the list does not rearrange itself while you read. The Shuffle button is for a real reshuffle.
- **Delete as you scroll** — a deleted card disappears immediately (optimistic update), and consecutive deletions are coalesced into one batch request; if the request fails the videos come back, with a toast explaining why.
- **Cached locally** — list, order and last-sync time live in localStorage, bucketed by a hash of the cookie. Within the 24-hour window the app renders from cache and only talks to bilibili when it is stale.
- **Settings** — single/double column layout, light/dark theme and the cookie itself; the panel header shows the last successful sync.
- **Cover proxy** — bilibili's image CDN checks the Referer, so covers are loaded through the backend.

### Privacy

Your cookie lives in your browser only. Each request carries it in the `x-bili-cookie` header to this app's backend, which forwards it to bilibili for that request and nothing else — no logs, no storage. There is no database and no account information on the server side.

Worth knowing: the cookie is stored in plain text in the browser's localStorage (key `bili-cookie`), where any script running on the page and any extension with access can read it. Cache entries are keyed by a hash of the cookie only to avoid copying it into more keys; that does not make it safer. The backend also necessarily sees the cookie while forwarding it — if you would rather not trust someone else's instance, deploy your own.

### Stack and layout

- `client/` — React 19 + Vite + Tailwind CSS 4. TanStack Query is used purely as a fetch primitive; the caching and refresh policy lives in `useVideos`.
- `server/` — Express 5 on TypeScript, deployed as a single Vercel Function. A thin proxy over three bilibili endpoints.
- Two independent pnpm packages, each with its own lockfile; the repo root holds tooling only (husky / lint-staged / prettier).

### API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/videos` | fetch and normalize the watch later list |
| `POST /api/videos/delete` | batch delete by aid (bilibili needs `bili_jct` from the cookie as csrf) |
| `GET /api/cover?url=` | cover proxy, restricted to `*.hdslb.com` |

The backend only answers requests whose `Origin` or `Referer` is an allowed frontend origin (`FRONTEND_URL`, a comma-separated list) or localhost. That stops other websites from driving the API from a visitor's browser, but tools like curl can forge both headers, so it is not authentication.

### Development

```bash
pnpm install
pnpm -C server install
pnpm -C client install

cp server/.env.example server/.env
pnpm -C server dev   # API on http://localhost:3000
pnpm -C client dev   # SPA on http://localhost:5173, /api is proxied
```

### Deployment (Vercel)

Two projects from this repository:

- **API** — Root Directory `server`; set `FRONTEND_URL` to the allowed frontend origin(s), comma-separated. No `vercel.json` is needed: Vercel detects the Express app in `server.ts`.
- **Client** — Root Directory `client`; set `VITE_API_URL` to the deployed API.

### Notes

An unofficial personal project, not affiliated with bilibili. The cookie is a live account credential — only use it in an environment you trust. Deletions run with your account's permissions, so make sure before you confirm.

---

## License

[MIT](LICENSE)
