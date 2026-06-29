# AI 地图助手 · UX 修复任务 Prompt

## 项目定位

这是一个「真实数据驱动的 AI 探店决策工具」——AI 理解用户问题后调高德 API 获取真实 POI 数据，叠加三个榜单（大众点评必吃榜 / 高德扫街榜 / 米其林必比登）做可视化展示。核心用户场景是：用户在手机上打开，看看周围步行可达的范围内有哪些上榜餐厅。

**不是导航软件**，已 disabled 的导航按钮保持原样不动（搜索/分析/设置 未来再做）。

---

## 项目路径

`/Users/urcute/Desktop/mac 高德api项目/amap-ai-map-assistant/`

## 核心文件

- `public/index.html` — 主页面（桌面端 + CSS 降级移动端）
- `public/mobile.html` — 独立移动端页面（如在使用）
- `public/styles.css` — 全部样式
- `public/app.js` — 全部前端交互逻辑（约 1500+ 行）

## 设计约定

- CSS 变量见 `:root`：`--teal: #007a64`（主色）、`--text: #1e293b`（正文）、`--muted: #64748b`（辅助色）、`--soft: #f1f5f9`（底色）、`--line: #e2e8f0`（分割线）
- 移动端断点：`@media (max-width: 767px)`
- 所有按钮用 `<button>`、图标用内联 SVG 或 CSS
- 对话气泡复用现有的 `.message` / `.message-body` / `.avatar` 结构
- 结果卡片复用现有的 `.place-card` / `.place-card-main` / `.place-inline-meta` 结构

---

## 任务 1：新增收藏功能（第二个 Dock Tab）

### 需求背景

当前产品左侧 Dock（桌面端 rail）和底部导航（移动端 bottom-nav）各有 5 个 tab，目前只有第一个"对话"是实际可用的。第二个"收藏"需要搭建完整框架。

### A. Dock 切换机制

1. 点击"收藏"tab 时，主界面切换到收藏视图，隐藏对话视图
2. Web 端点击 rail 中的收藏按钮（现在是 disabled 的 `☆` 按钮）、移动端点击底栏收藏按钮
3. 点击"对话"tab 时回到对话视图
4. 当前 active tab 用 `is-active` 标记

### B. 收藏面板 UI

1. 页面标题改为"我的收藏"
2. 如果收藏列表为空：
   - 显示空状态：一个灰色大 heart outline SVG + "还没有收藏的地点" + "在搜索结果中点击❤️即可收藏"
3. 如果有收藏内容：
   - 显示收藏卡片列表，每张卡片复用现有的 `.place-card` 结构
   - 每张卡片包含：序号/图标、地点名称、地址/距离/品类、取消收藏的❤️按钮
   - 卡片支持点击（在地图上定位该点）

### C. 收藏/取消收藏交互

1. 在所有 `.place-card` 右上角增加一个心形收藏按钮（`.fav-button`）
   - 未收藏：空心心形 SVG，灰色 `#94a3b8`
   - 已收藏：实心心形 SVG，红色 `#dc2626`
   - 点击时 200ms 弹跳动画（scale 1 → 1.2 → 1）
   - 点击切换状态，不要弹出确认框
2. 收藏的数据结构：
   ```js
   {
     id: "poi-{name}-{address}",
     name: "店名",
     address: "地址",
     location: "121.xxx,31.xxx",
     type: "餐饮服务",
     distance: "200",
     rankingLabels: ["必吃榜"],
     savedAt: "2026-06-28T..."
   }
   ```
3. 存入 `localStorage`，key 为 `amap_favorites`
4. 收藏/取消收藏时用 `CustomEvent('favorites-changed', { detail: { favorites } })` 通知收藏面板刷新

### D. 对话视图中的联动

1. 当新消息渲染出 `.place-card` 时，检查该 POI 是否已在收藏中，若已收藏则心形标红
2. 收藏状态变更后，如果当前对话区域有已渲染的卡片，同步更新其心形状态

### E. 具体代码位置

**app.js：**
- 找到 Dock tab 的点击事件绑定（`bindEvents` 中，搜索 `rail-item` 或 bottom-nav 的点击处理）
- 找到创建 `.place-card` 的函数（搜索 `placeCard` 或 `createPlaceCard` 或消息渲染函数）
- 在这些位置注入收藏逻辑

**index.html：**
- rail 中的收藏按钮（约行 16）：去掉 `disabled` 和 `is-disabled`，加上 `id="favoritesTab"`
- bottom-nav 中的收藏按钮（约行 164-169）：同样处理

**styles.css 中新增样式：**

```css
.fav-button {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px; height: 28px;
  border: 0; border-radius: 999px;
  background: rgba(255,255,255,0.9);
  display: grid; place-items: center;
  cursor: pointer; color: #94a3b8;
  transition: color 180ms ease; z-index: 2;
}
.fav-button.is-faved { color: #dc2626; }
.fav-heart-icon { width: 16px; height: 16px; stroke: currentColor; fill: currentColor; }
@keyframes favPop {
  0% { transform: scale(1); }
  40% { transform: scale(1.2); }
  100% { transform: scale(1); }
}
.fav-button.is-faved .fav-heart-icon { animation: favPop 200ms ease; }
.fav-panel { display: none; }
.fav-panel.is-active { display: block; }
.fav-empty {
  display: grid; place-items: center; gap: 12px;
  padding: 60px 20px; color: var(--muted); text-align: center;
}
.fav-empty svg { width: 48px; height: 48px; stroke: #cbd5e1; }
.fav-empty p { font-size: 13px; line-height: 1.6; }
```

### 验收标准

1. 桌面端点击左侧 rail 的 ☆ 按钮 → 切换到收藏面板（空状态显示提示文字）
2. 在对话中问"上海静安寺附近有什么必吃榜" → 结果卡片右上角出现空心❤️
3. 点击❤️ → 变红 + 弹跳动画 → 切换到收藏 tab → 看到该店信息
4. 刷新页面 → 切换到收藏 tab → 该店仍然在列表中
5. 在收藏列表中点击❤️ → 取消收藏 → 页面刷新后消失
6. 切换回对话 tab → 正常对话功能不受影响
7. 移动端底部导航的收藏 tab 同样可用
8. 已收藏的 POI 在对话中再次出现时，心形默认是红色实心状态

---

## 任务 2：修复移动端字号过小、对比度不足

### 改动 1：全局 muted 颜色加深

`styles.css` 行 8：`--muted: #64748b` → `--muted: #475569`

### 改动 2：移动端字号覆盖

在 `@media (max-width: 767px)` 块内（约行 1678）新增：

```css
.message-body p { font-size: clamp(15px, 2.2dvh, 16px); }
.place-card strong { font-size: clamp(14px, 2dvh, 15px); }
.place-inline-meta { font-size: clamp(12px, 1.6dvh, 13px); }
.evidence-row { font-size: clamp(11px, 1.5dvh, 12px); }
.shortcut-tag { font-size: clamp(12px, 1.6dvh, 13px); }
.search-hint { font-size: clamp(12px, 1.6dvh, 13px); }
.map-legend span { font-size: clamp(11px, 1.4dvh, 12px); }
.engine-powered-tag { font-size: clamp(11px, 1.4dvh, 12px); }
.context-text, .context-banner-text { font-size: clamp(11px, 1.4dvh, 12px); }
.chat-input input { font-size: 16px; }
```

### 验收标准

1. 移动端 375px 宽度下，对话正文清晰可读（约 15-16px）
2. 辅助信息不小于 12px
3. 灰色文字在白色背景上对比度高于 4.5:1
4. 桌面端不受影响
5. iPhone SE (320px) 宽度下没有溢出或截断

---

## 任务 3：修复移动端对话区滚动体验

### 问题

当前移动端 `.chat-stream` 的 `max-height: clamp(4.5rem, 16dvh, 12rem)` 太小，收到 3 条以上回复后只能看到最后 1 条。且新消息插入后不自动滚到底。

### 样式改动

在 `@media (max-width: 767px)` 块内：

```css
.chat-stream {
  flex: 1 1 auto;        /* 原 flex: 0 0 auto */
  max-height: clamp(9rem, 40dvh, 22rem);  /* 原 clamp(4.5rem, 16dvh, 12rem) */
}
body.has-messages .chat-stream {
  max-height: clamp(9rem, 42dvh, 24rem);  /* 原 clamp(5rem, 18dvh, 13rem) */
}
```

### 逻辑改动

在 `app.js` 中找到向 `#conversation` 追加消息的函数，加入自动滚动逻辑：

```js
function scrollConversationToBottom() {
  const el = els.conversation;
  if (!el) return;
  const threshold = 60;
  const isNearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
  if (isNearBottom) el.scrollTop = el.scrollHeight;
}
```

每次追加消息后调用 `scrollConversationToBottom()`。

### 验收标准

1. 连续发 5 条消息，对话区至少能看到 3-4 条最近消息
2. 新消息到达时，如果用户在底部，自动滚动到最新消息
3. 如果用户向上翻看历史消息，新消息到达时不强制滚动
4. 桌面端不受影响

---

## 任务 4（可选）：移动端底部结果抽屉手势优化

在 `bindEvidenceDrawerGestures` 函数中增强手势识别：

1. `touchstart` 记录起始 Y
2. `touchmove` 根据位移调整抽屉 `max-height`
3. `touchend` 判断位移是否超过阈值（60px）→ 展开或收起

---

## 执行顺序建议

1. **任务 2（字号）** — CSS 改动，风险最小
2. **任务 1（收藏）** — 核心新功能，涉及 HTML+CSS+JS
3. **任务 3（对话区滚动）** — CSS + 少量 JS
4. **任务 4（抽屉手势）** — 纯体验优化

## 验收总清单

- [ ] 字号调大后移动端阅读舒适
- [ ] 灰色文字对比度达标
- [ ] 对话结果卡片右上角有收藏心形按钮
- [ ] 点击心形收藏/取消收藏，状态持久化
- [ ] 第二个 Dock tab 能展示收藏列表
- [ ] 收藏列表空状态正常显示
- [ ] 对话区消息多了能看到历史
- [ ] 新消息到达自动滚到底
- [ ] 桌面端功能不受影响
- [ ] 移动端 375px 和 320px 宽度下布局正常
