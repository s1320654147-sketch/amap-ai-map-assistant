# Codex Project Context

Last updated: 2026-06-27

This file is the main handoff note for new Codex chats in this workspace. When a new chat starts, read this file first before changing code.

## Project

- Workspace: `D:\Users\Administrator\Documents\高德地图API`
- Product: a web AI map assistant using DeepSeek for language understanding and AMap/Gaode for real POI, route, nearby, and ranking data.
- Core goal: avoid AI hallucinated places by forcing factual location data to come from AMap/Gaode, then let DeepSeek explain and summarize results.
- Current default local URL: `http://localhost:5177/`
- Mobile preview uses the same local service. Phone access requires the computer LAN IP, for example `http://<电脑局域网IP>:5177/mobile`; the IP may change.

## Must-Follow User Rules

- By default, only modify and test on localhost.
- Do not push to GitHub, do not deploy to Render, and do not spend deployment quota unless the user explicitly says it is allowed, for example "可以推 GitHub", "可以发 Render", "可以上线".
- If working locally, report changed files and verification status. Do not dump large full-file code unless the user explicitly asks.
- Keep the main local port fixed at `5177`. Port `5188` was only a temporary test port in earlier work.
- The user is non-technical and prefers direct background edits plus concise summaries.
- Weekend cross-device work uses `codex/weekend-handoff-20260627`. Do not merge it to `main` or deploy Render without explicit user approval.
- For a new computer or new Codex chat, read both `CODEX_CONTEXT.md` and `WEEKEND_HANDOFF.md`.

## Important Source Threads Read

This summary was built from the project-related Codex threads available in the app:

- `019ee8d2-3ae7-7bc1-b2d6-e0ec920352c4`: initial product build, deployment discussion, DeepSeek + AMap architecture, multi-turn context, UI evolution.
- `019ef2e8-1954-7261-885e-96a3df157ed6`: geolocation precision, manual map location correction, dynamic prompt/context sync, dropdown filters.
- `019ef380-8977-7d93-b24b-4eb6402c9db8`: layout fixes, mobile fixes, brand filtering, ranking map layer, deployment rules, port stabilization.
- `019efd9b-19f1-76e3-9da0-1bf40e63f576`: most recent product bug fixes for `/api/agent/stream`, evidence expansion, POI ranking, loading locks, UI simplification.

The project memory repository did not contain durable task memory for this project; the useful history came from Codex thread records and current project files.

## Current File Map

Main runtime files:

- `server.js`: Node server, API routes, DeepSeek planning/summarization, AMap requests, retries, ranking data, cluster matching, context logic.
- `public/app.js`: front-end state, AMap JS map, geolocation, chat flow, streaming agent call, ranking layer, evidence list, context UI.
- `public/styles.css`: desktop/mobile layout, chat/map shell, ranking marker/filter styles, context bar, responsive fixes.
- `public/index.html`: desktop/main entry.
- `public/mobile.html`: mobile entry.
- `data/lists.json`: imported ranking list data.
- `data/lists.resolved.json`: ranking entries resolved to coordinates/cache.
- `public/assets/`: AMap, DeepSeek, ranking logos.
- `.env`: local secrets and runtime config. Do not expose.
- `render.yaml`: Render deployment config.
- `README.md`: basic setup/deployment notes.

Current known git state before this context update:

- Modified tracked files: `server.js`, `public/app.js`, `public/index.html`, `public/mobile.html`, `public/styles.css`.
- Untracked source assets/data: `images.jpg`, `images.png`, `37271e0c2fb0db07fd869b8aaf8b0fdc.jpg`, and three Shanghai ranking CSV files.
- Do not revert or delete these without asking. They come from previous project work.

## Runtime And Environment

Run locally:

```powershell
node server.js
```

Then open:

```text
http://localhost:5177/
```

Expected `.env` keys:

- `AMAP_KEY`: Gaode Web service key.
- `AMAP_JS_KEY`: Gaode JS API key.
- `AMAP_SECURITY_JS_CODE`: Gaode JS security code.
- `DEEPSEEK_API_KEY`: DeepSeek API key.
- `DEEPSEEK_MODEL`: currently expected around `deepseek-v4-flash`.
- `DEEPSEEK_BASE_URL`: typically `https://api.deepseek.com`.
- `PORT=5177`.
- `AMAP_MIN_INTERVAL_MS`: AMap request throttle, historically adjusted upward for rate-limit protection.

Useful checks:

```powershell
node --check server.js
node --check public/app.js
```

Health endpoint:

```text
GET /api/health
```

## Product Architecture

Target agent chain:

1. User asks a natural-language map question.
2. DeepSeek does planning/intent parsing only.
3. Server calls AMap/Gaode for factual POI, nearby, route, geocode, or cluster data.
4. Optional DeepSeek filtering/summarization runs only over returned factual candidates.
5. Front end renders answer, map markers, evidence rows, and context state.

Important principle: DeepSeek should not invent place facts. Place names, addresses, routes, distances, and ranking evidence must come from AMap/Gaode or local imported ranking data.

Implemented query types:

- `nearby`: nearby/周边/步行 N 分钟内/某地附近.
- `route`: distance/time/route questions.
- `search`: normal POI or brand search.
- `cluster`: "同时有 A 和 B", "既有 A 又有 B", multi-brand or multi-condition co-location.
- `countMode`: "一共多少家/总共有多少家/门店数量" style queries.

Current important endpoints:

- `POST /api/agent/stream`: main current front-end path for streamed answer + final payload.
- `POST /api/agent`: older/non-stream agent path.
- `GET /api/nearby`: nearby defaults and map/filter refresh.
- `GET /api/cluster`: factual co-location/multi-condition cluster matching.
- `GET /api/rankings/map`: persistent ranking map layer.
- `POST /api/rankings/resolve`: ranking list resolving/caching.
- `GET /api/config`: front-end AMap JS config.

## Current Behavior To Preserve

### Core Chat

- Front end uses `/api/agent/stream` for main chat.
- It should receive streaming narration and a final payload.
- User question example that must not fail:
  `人民广场附近适合两个人吃晚饭的本帮菜，步行15分钟内，帮我推荐3个`
- That example was fixed to return:
  - `intent: nearby`
  - `keywords: 本帮菜`
  - `radius: 1200`
  - `limit: 3`
  - no `ENGINE_RESPONSE_DATA_ERROR`
  - many `allPois` entries for "查看更多".

### Context And Multi-Turn

- Front end sends recent history + structured context.
- Server returns `context`; front end applies it with `applyServerContext`.
- Context should remember:
  - last city
  - last district
  - last address / resolved origin
  - last keywords/category
  - last walk minutes/radius
  - last route origin/destination
- Follow-ups like "那有没有西餐呢", "再找点咖啡", "步行15分钟内呢" should inherit the previous anchor location and stay as `nearby`, not fall back to Shanghai/global search.
- A previous critical case:
  1. `义乌陆港电商城附近有什么吃的`
  2. `有没有什么西餐`
  Should stay anchored around Yiwu/Lugang E-commerce City, not jump to Shanghai or Quanzhou.

### Geolocation

- AMap Geolocation should use:
  - `enableHighAccuracy: true`
  - `timeout: 10000`
  - `zoomToAccuracy: true`
- Browser/hardware location may still be inaccurate on desktop. There is manual correction by clicking/double-clicking the map to reset "my current location" and refresh nearby data.
- Quick prompts and context UI should update from current city/district when possible.

### Nearby Defaults

- Initial right-side evidence/list should not use hardcoded default stores.
- It should use dynamic nearby probing based on detected or fallback location.
- Title should be around "我的周边/您的周边", depending on current UI text.

### Filters

- Top map filters are intended to be real controls, not static pills:
  - city
  - walking time
  - category
- Changing them should refresh map markers and evidence list.

### Evidence List

- Evidence rows should show "标签", not fake "评分", because Gaode results often do not provide ratings.
- Results are no longer limited to only the first 6 forever.
- "查看更多" should expand/collapse or reveal more `allPois`.
- Top and bottom send buttons should be disabled together during requests to prevent concurrent context corruption.
- Cities without imported ranking data must use local AMap nearby fallback and must never show Shanghai ranking entries.
- Local fallback and ranking rows are sorted by real distance ascending; ratings come from AMap `biz_ext.rating`.

### AI Discovery

- The top-right circular arrow is the AI inspiration/discovery action, not a static fit-map button.
- Clicking it selects a curated discovery prompt, fills the main input, animates the arrow, and automatically submits.
- The local `normalizeCityDisplay is not defined` regression was fixed by adding the missing display normalization helper.

### Ranking Layer

The project has a persistent Shanghai restaurant ranking map layer based on three imported lists:

- 上海扫街榜
- 上海必比登推介
- 上海大众点评必吃榜

Assets:

- `public/assets/saojiebang-logo.png`
- `public/assets/bibendum-logo.jpg`
- `public/assets/bichibang-logo.jpg`

Historical validation:

- Ranking map layer produced about `317` points.
- About `17` were double/multi-ranking points.
- Markers support click detail.
- Filtering supports all / 必吃榜 / 扫街榜 / 必比登 / 多榜.
- Ranking filter pills were upgraded with logos, `14px * 14px`, inline-flex alignment, hover elevation, soft shadow, and brand color glow.

### Brand And Cluster Logic

This is a central product requirement. Brand queries must mean official brand stores/brand POIs, not random places whose address or mall name contains the word.

Implemented/desired rules:

- For brand terms like 山姆, 大疆, 蜜雪冰城, 喜茶, 盒马, 奥乐齐:
  - default meaning is official brand store/brand POI.
  - match primarily against `poi.name`.
  - do not let address/mall/landmark text override brand matching.
  - exclude irrelevant variants unless user explicitly asks for them.
- Default false-positive exclusions include:
  - 员工餐厅, 员工食堂, 职工餐厅, 职工食堂
  - 内部餐厅, 内部食堂, 园区食堂, 公司食堂
  - 配送站, 云仓, 奥莱, mini, 仅限APP配送, 快闪点, 柜台
- DeepSeek prompts were tightened so names must be copied from original AMap `poi.name` values. It should not rewrite store names into mall/address names.
- "同时有 A 和 B" queries should force `cluster`; DeepSeek must not degrade them into ordinary search.
- Cluster queries were expanded beyond first page result limits to reduce missing true matches.
- Important validation case:
  `上海有哪些地方同时有盒马和奥乐齐`
  Must include the 大华 combination:
  `盒马鲜生(大华虎城嘉年华店) + ALDI奥乐齐(宝山大华虎城店)`

### Count Mode

Queries like:

- `上海市一共多少家CoCo`
- `上海市一共多少家喜茶`
- `上海市一共多少家蜜雪冰城`

should answer counts/scale first, not the old "推荐前十家" template.

Historical local validations:

- CoCo: 311 after improved pagination in later test.
- 喜茶: 234.
- 蜜雪冰城: "至少 465 家" when not exhaustive.

If count is not exhaustive, answer should say "至少 X 家" instead of pretending the number is exact.

## UI/Layout History And Current Design Intent

The UI evolved into a SaaS-like split-screen:

- Left: chat/agent panel.
- Right: AMap map + evidence/list.
- Avoid marketing landing pages; the first screen is the usable app.
- Use a calm, polished, functional visual style.

Important layout fixes already made:

- Left white ask card must not overflow into the map.
- Containers should use `box-sizing: border-box`, `max-width: 100%`, and `overflow-x: hidden` where needed.
- Main input row should be flex:
  - textarea/input: `flex: 1; min-width: 0`
  - send button: `flex-shrink: 0`
- Quick tags should wrap with flex-wrap.
- Mobile view should not let chat grow infinitely and push the map far down; chat should have internal scroll.
- Mobile top cards should be visually even left/right.
- Map controls must avoid overlapping:
  - AMap logo/copyright
  - "200m" scale
  - relocate button
  - bottom legend/filter labels
- Sidebar rail entries that do not have real functions should be disabled/coming soon, not look like live navigation.
- Initial screen should reduce noise: focus user on input or location permission; badges/context/filter details can appear after interaction.

Stateful chat layout:

- Initial state: show hero ask card with input + quick prompts.
- After first message: hide top ask card, show chat stream with a context banner at top and sticky follow-up input at bottom.
- The context banner matters because the user needs to see what location/category the agent is currently using.

## Known Failure Modes And Fixes

### `ENGINE_RESPONSE_DATA_ERROR`

Cause was often AMap place search or model/rule mismatch causing empty/bad result flow. The recent nearby example around 人民广场/本帮菜 was fixed by:

- classifying "步行N分钟内" nearby questions as `nearby`, not `route`.
- preserving cuisine keyword like 本帮菜.
- converting 15 minutes to about 1200m.
- retrieving more pages.
- fallback searches when exact cuisine is sparse.
- ranking/cleaning POIs.

### `fetch failed`

This means server-side network request to AMap/DeepSeek failed before a business response. Fixes added:

- fetch timeout/retry wrapper.
- friendlier errors after retry.
- still possible on Render/free/network environments.

### `CUQPS_HAS_EXCEEDED_THE_LIMIT`

Gaode rate limit. Fixes/mitigations:

- increase request spacing.
- backoff retry.
- avoid over-broad cluster fanout when possible.
- `.env` can raise `AMAP_MIN_INTERVAL_MS`.

### Old Node Process

Several "bug still exists" reports were actually because the Node process on `5177` was still running old `server.js`.

When backend logic changes:

- stop/restart the `node server.js` process.
- verify `/api/health`.
- ask user to Ctrl+F5 if front-end assets changed.

### Browser Cache

Past fixes often required bumping `?v=...` in `index.html` and `mobile.html`.

If UI does not change after edits:

- confirm asset version in HTML.
- hard refresh with Ctrl+F5.
- static files are served no-store, but version bump has still been useful.

### Encoding/PowerShell Chinese

PowerShell requests sometimes turned Chinese into `????`, causing false test failures. Prefer:

- browser testing.
- Node scripts with UTF-8 strings.
- URL-encoded requests.

Do not conclude natural-language parsing failed until the actual request body encoding is verified.

## Current Working Baseline

The latest known local baseline after the most recent thread:

- `node --check server.js` passed.
- `node --check public/app.js` passed.
- `/api/agent/stream` with the 人民广场/本帮菜 question no longer returns error.
- It returned stable `nearby`, `radius: 1200`, `keywords: 本帮菜`, and many `allPois` entries.
- Service was restarted on `http://127.0.0.1:5177`.
- AI Discovery was browser-tested locally: click -> random prompt -> automatic submit -> map/evidence response.
- Current local-only files before the weekend handoff commit: `public/app.js` and `public/styles.css`.
- Cross-device instructions live in `WEEKEND_HANDOFF.md`; home setup helper is `scripts/setup-home.ps1`.

Because files are currently modified in the working tree, re-verify before making new feature changes.

## Deployment Notes

The project can become a real shareable website without rewriting the product. It is already a front-end + Node backend app.

Deploying requires:

- deploy `server.js` and `public/`.
- configure env vars on hosting platform.
- use HTTPS/domain.
- configure Gaode key/domain/security settings as needed.
- keep API keys server-side.

Recommended process:

1. Develop and test on localhost.
2. Batch normal UI improvements instead of deploying every tiny change.
3. Deploy urgent bugs immediately only with explicit user approval.
4. GitHub push triggers Render deploy when approved.

## Suggested Next Steps For A New Chat

1. Read this file first.
2. Run:
   ```powershell
   git status --short
   node --check server.js
   node --check public/app.js
   ```
3. If testing the app, ensure only one service is running on `5177`.
4. If changing backend behavior, restart Node before validating.
5. If changing front-end JS/CSS, bump resource version in `public/index.html` and `public/mobile.html` if the browser may cache old assets.
6. Preserve the user rule: no GitHub/Render deployment without explicit consent.
7. For weekend work, stay on `codex/weekend-handoff-20260627`.

## Quick Test Prompts

Use these as regression checks:

- `人民广场附近适合两个人吃晚饭的本帮菜，步行15分钟内，帮我推荐3个`
- `义乌陆港电商城附近有什么吃的`
- then: `有没有什么西餐`
- then: `步行15分钟内呢`
- `上海有哪些地方同时有盒马和奥乐齐`
- `上海市一共多少家CoCo`
- `上海市一共多少家喜茶`
- `上海市一共多少家蜜雪冰城`

Expected behavior:

- Nearby follow-ups inherit the last location.
- Brand co-location uses factual AMap cluster matching.
- Counts answer count/scale first.
- Evidence list can reveal more than the first few rows.
- No fake "评分" column unless real score data exists.
