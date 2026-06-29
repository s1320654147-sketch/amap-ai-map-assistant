# 周末跨电脑项目交接

更新时间：2026-06-29

## 最重要的结论

这次跨电脑继续做这个项目，必须同时带上 4 类东西：

1. GitHub 仓库代码。
2. 根目录私密 `.env`。
3. `CODEX_CONTEXT.md` 和本文件。
4. 当前协作分支：`codex/weekend-handoff-20260627`。

GitHub 仓库地址：

```text
https://github.com/s1320654147-sketch/amap-ai-map-assistant.git
```

当前继续开发分支：

```text
codex/weekend-handoff-20260627
```

重要补充：

- 现在 Render 已经被用户切到跟踪 `codex/weekend-handoff-20260627`。
- 所以以后对这个分支执行 `git push`，除了保存到 GitHub 之外，通常也会触发 Render 自动部署。
- 如果某次只想本地做、不想影响线上，就不要推送，或者先把 Render 自动部署/跟踪分支调整掉。

## 当前机器与项目定位

当前这次续做是在 Mac 上完成的：

```text
/Users/urcute/Desktop/mac 高德api项目/amap-ai-map-assistant
```

本项目产品定位：

- 一个 AI 地图助手。
- DeepSeek 负责语言理解、意图规划、总结。
- 高德 AMap 负责真实 POI、路线、周边搜索、地理编码。
- 原则：地点、距离、路线、榜单等事实必须来自高德或本地榜单数据，不能幻觉。

本地固定端口：

```text
http://localhost:5177
```

## 新电脑 / 新 Codex 聊天开始时的固定动作

把下面这段原样发给新的 Codex：

```text
请先完整读取 CODEX_CONTEXT.md 和 WEEKEND_HANDOFF.md，再运行 git status、git branch --show-current、node --check server.js、node --check public/app.js。这个项目周末只在 codex/weekend-handoff-20260627 分支继续，不要推 main、不要部署 Render，除非我明确授权。
```

然后要求它继续确认：

1. 根目录 `.env` 存在。
2. `npm start` 已在 `5177` 启动。
3. 已本地打开 `http://localhost:5177` 验证。

## 两台电脑接力协作规则

现在推荐的真实工作流就是两台电脑都用同一个分支：

```text
codex/weekend-handoff-20260627
```

标准接力方式：

1. 在开始改代码前，先执行：

```powershell
git switch codex/weekend-handoff-20260627
git pull origin codex/weekend-handoff-20260627
```

2. 改完后先本地验证，再执行：

```powershell
git push origin codex/weekend-handoff-20260627
```

3. 另一台电脑开始接手前，再执行一次：

```powershell
git pull origin codex/weekend-handoff-20260627
```

只要遵守“先 pull、再改；改完再 push”，两台电脑就可以正常接力。

风险提示：

- 不要两台电脑同时各自改很多代码但都不先 pull。
- 否则第二台 push 时容易遇到分支落后或冲突。
- 这个项目当前不建议回到 `main` 继续做，除非用户明确决定要合并主线。

## 2026-06-29 晚上这次真实状态快照

本次记录时，执行结果如下：

### 分支

```text
git branch --show-current
codex/weekend-handoff-20260627
```

### 语法检查

```text
node --check server.js
通过

node --check public/app.js
通过
```

### 提交前工作区状态

```text
git status --short
 M public/app.js
 M public/index.html
 M public/styles.css
?? .codex/
?? UX_FIX_TASKS.md
?? UX_FIX_TASKS_v2.md
?? package-lock.json
```

说明：

- `.codex/` 是本机本地辅助目录，不建议提交。
- `UX_FIX_TASKS.md` 与 `UX_FIX_TASKS_v2.md` 是这轮 UI/UX 需求文档，建议保留进仓库。
- `package-lock.json` 如果本次一并提交，可以帮助另一台电脑更稳定地安装依赖。

## 当前必须保留的项目能力

### 核心意图

已支持并必须继续保持稳定：

- `nearby`
- `route`
- `cluster`
- `travel`
- `search`

### 既有逻辑底线

这些都不能回归：

- “人民广场附近适合两个人吃晚饭的本帮菜，步行15分钟内，帮我推荐3个” 不能再报错。
- `travel` 用于“玩一天 / 下雨去哪 / 不太累 / 散步 / 朋友聚餐”这类场景时，要返回真实候选地点，不伪造整条路线。
- route 失败时要返回产品级友好文案，不直接暴露底层报错。
- 顶部和底部发送按钮有并发锁。
- 证据列表支持“查看更多”。
- 非榜单城市不能跨城显示上海榜单，必须走高德普通 POI 兜底。
- 列表和地图排序要优先按距离升序。
- “评分”只能显示高德真实评分，不能乱塞标签或人均价。
- `normalizeCityDisplay is not defined` 不能回归。

## 这次 2026-06-29 新增并已完成的内容

### 移动端布局与体验

- 处理了移动端 `100vh / h-screen` 被微信、Safari、浏览器原生导航遮挡的问题。
- 采用 `--app-height` + 动态视口思路来保护底部导航和输入区。
- 移动端布局引入了更强的流体缩放思路，包括 `clamp()`、`shrink-0`、更稳的地图与输入区空间分配。
- 地图和结果区做了更适合手机的空间再分配。

### 语音输入

- 桌面端仍然保留点击触发语音。
- 移动端改成长按语音。
- 支持上滑取消。
- 语音按钮已经从 Emoji 替换成专业 SVG 图标。

### 收藏系统

- 左侧栏 / 底部导航可切换到收藏视图。
- 结果卡片支持收藏/取消收藏。
- 榜单信息窗支持收藏按钮。
- 收藏状态会同步到前端界面，并保存在 localStorage。

### 地图图层与说明

- 地图左下角图例已恢复。
- 已加入图层切换：
  - 步行范围
  - 美食/店铺
  - 全部榜单
- `全部榜单` 支持切换到“none / 全关”状态。
- 普通 POI marker 可点击弹出简版信息窗。

### 输入区与引导

- AI 灵感入口已迁移到左侧 AI 输入区。
- 移动端提示词改成单行横向滑动，不再折成两行挤压。
- 默认提示文案已从“电影院”调整成更通用的“值得去的地方”。
- 增加了首访引导卡片。

### 桌面端视觉

- 左侧主面板宽度从 `420px` 收到 `380px`。

## 当前最值得下一步继续验收的地方

明天切到另一台电脑后，优先做这些回归：

1. 移动端真机验证：
   - 微信内置浏览器
   - Safari
   - Chrome

2. 语音输入验证：
   - 移动端长按开始
   - 上滑取消
   - 桌面端点击录音仍正常

3. 收藏链路验证：
   - 普通 POI 卡片收藏
   - 榜单信息窗收藏
   - 收藏页切换

4. 地图 UI 验证：
   - 图例显示
   - 图层切换
   - 抽屉展开收起时图层不遮挡

5. 核心意图回归：
   - `nearby`
   - `route`
   - `travel`
   - `search`
   - `cluster`

## 明天如果继续开发，建议先做什么

建议顺序：

1. 先 `git pull origin codex/weekend-handoff-20260627`
2. 再让新的 Codex 先读两份 MD
3. 跑语法检查
4. 启动 localhost
5. 先验收今天这批移动端改动
6. 再继续做新的 bug 或需求

## 本次建议提交范围

本次为了完整保存“今晚所有进度”，建议提交这些文件：

- `public/app.js`
- `public/index.html`
- `public/styles.css`
- `CODEX_CONTEXT.md`
- `WEEKEND_HANDOFF.md`
- `UX_FIX_TASKS.md`
- `UX_FIX_TASKS_v2.md`
- `package-lock.json`

不要提交：

- `.env`
- `.codex/`
- 其他本机私密或临时文件

## 一句话记忆

如果明天换电脑，只要先拉 `codex/weekend-handoff-20260627`，再让新的 Codex 先读 `CODEX_CONTEXT.md` 和 `WEEKEND_HANDOFF.md`，它就能基本接上今天做到的位置，继续往下做，而不是从零开始猜。
