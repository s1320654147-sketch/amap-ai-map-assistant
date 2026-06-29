# 高德 AI 地图助手 · 综合优化 Prompt

## 项目定位

这是一个「真实数据驱动的 AI 探店决策工具」——AI 理解用户问题后调高德 API 获取真实 POI 数据，叠加三个榜单（大众点评必吃榜 / 高德扫街榜 / 米其林必比登）做可视化展示。核心用户场景是：用户在手机上打开，看看周围步行可达的范围内有哪些上榜餐厅。

**不是导航软件**，已 disabled 的按钮保持原样不动。

## 项目路径

`/Users/urcute/Desktop/mac 高德api项目/amap-ai-map-assistant/`

## 核心文件

- `public/index.html` — 主页面
- `public/styles.css` — 全部样式
- `public/app.js` — 全部前端交互逻辑

## 设计约定

- CSS 变量见 `:root`：`--teal: #007a64`（主色）、`--text: #1e293b`（正文）、`--muted: #475569`（辅助色）、`--soft: #f1f5f9`（底色）、`--line: #e2e8f0`（分割线）
- 移动端断点：`@media (max-width: 767px)`
- 所有按钮用 `<button>`、图标用内联 SVG 或 CSS
- 对话气泡复用现有的 `.message` / `.message-body` / `.avatar` 结构
- 结果卡片复用现有的 `.place-card` / `.place-card-main` / `.place-inline-meta` 结构

---

## 任务 1：移动端对话区空间优化

### 问题

当前移动端 `chat-stream`（对话区）的 `max-height: clamp(9rem, 40dvh, 22rem)`，在 iPhone 14 Pro（844px 视口）上最多约 337px。但：
- 减去 context-banner（约 36px）和消息间距后，**实际可读区域仅 ~280px**
- 一条 AI 回复（含 3 段分析文字约 120-200 字）就占去约 180-250px
- 加上结果卡片，2 条消息后就装满需要滚动了
- 而地图占用了 ~310px，在"看结果"时地图不是首要信息

### 改动要求

**A. 有消息时，地图让步于对话区**

在 `body.has-messages` 状态下的移动端，将对话区的可用空间优先级设为高于地图：

```css
/* 移动端有消息时，对话区扩大到更多比例 */
body.has-messages .chat-stream {
  flex: 1 1 0;
  min-height: 0;
  max-height: none;  /* 去掉固定上限 */
}
```

同时缩小地图在有消息时的最小高度：

```css
body.has-messages .right-map-container {
  min-height: 160px;  /* 从 var(--mobile-map-min) 减小 */
}
```

目的：有消息时用户主要在看结果，地图作为辅助参考，不需要那么大。用户回到无消息状态时，地图恢复原有大小（`min-height: var(--mobile-map-min)`）。

**B. AI"思考中"消息自动折叠**

当 AI 流式结果到达最终 `done` 事件（`appendAnswer` 被调用）时，将上方的"思考中"消息（`is-pending` 状态的 `.message`）自动隐藏或折叠（`display: none`）。因为这份内容在最终的 `answer` 结果中已有包含，思考过程不需要一直占空间。

在 `streamAgentReply` 的 `done` 事件处理末尾，或在 `appendAnswer` 函数中，找到上一条 `is-pending` 的消息并隐藏它：

```js
// 找到上一条 pending 消息并折叠
const pendingMsg = els.conversation?.querySelector('.message.is-pending');
if (pendingMsg) {
  pendingMsg.style.display = 'none'; // 或 height: 0; overflow: hidden;
}
```

**C. 减小 AI 回复在移动端的段落间距**

当前 `white-space: pre-line` 会把 AI 回复里的双换行符渲染为空白段落，在移动端显得松散。在移动端将段落间距压缩：

```css
@media (max-width: 767px) {
  .message-body p {
    margin: 0;
    font-size: clamp(15px, 2.2dvh, 16px);
  }
  .message-body p + p {
    margin-top: 4px;  /* 缩小段落间距 */
  }
}
```

**D. 移动端 Place Card 紧凑化**

在移动端，结果卡片面积较大但信息密度低。做如下压缩：

```css
@media (max-width: 767px) {
  .place-card {
    padding: 10px 40px 10px 10px;  /* 从 14px → 10px */
    gap: 8px;  /* 从 12px → 8px */
  }
  .place-photo {
    width: 36px;   /* 从 44px → 36px */
    height: 36px;
  }
  .place-card strong {
    font-size: 14px;  /* 固定为 14px，不随 dvh 变化 */
  }
  .place-inline-meta {
    font-size: 12px;
  }
  .place-badges span {
    font-size: 10px;
    padding: 2px 6px;
  }
  .fav-button {
    width: 24px;      /* 缩小心形按钮 */
    height: 24px;
    top: 6px;
    right: 6px;
  }
  .fav-heart-icon {
    width: 14px;
    height: 14px;
  }
}
```

**E. 卡片数量限制**

当前 `buildAnswerCards` 中 `pois.slice(0, 4)` 最多展示 4 张结果卡片。在移动端，建议限制为 `pois.slice(0, 2)`，减少首次渲染的垂直内容量，用户可通过"查看更多"查看后续。

### 验收标准

1. 移动端输入查询后，对话区能展示 3-4 条消息而不需要滚动
2. "思考中"消息在结果到达后自动消失
3. 结果卡片在移动端紧凑紧凑，心形按钮不遮挡店名
4. 地图在有消息时自动缩小，给对话区更多空间

---

## 任务 2：功能开关机制（步行范围 + 美食店铺 + 榜单独立 Toggle）

### 需求背景

当前产品首次打开就默认展示：
- 步行 15 分钟范围圈（虚线圆）
- 美食店铺标记
- 全部上海榜单店铺（约 200 个标记）

用户可能想自定义这些图层的显隐，比如只想看公园不想看美食，或者暂时不要榜单数据。

### 改动要求

**A. 在 map-toolbar 区域下方（或 ranking-toolbar 旁边）增加一排 Chip-style Toggle**

格式为水平排列的可点击 chips，每个 chip 显示当前状态（显/隐）：

```
[◎ 步行范围] [◎ 美食/店铺] [◎ 全部榜单 ▼]
```

- `◎` = 当前显示，`○` = 当前隐藏
- 点击切换显隐

新增 CSS：

```css
.layer-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--muted);
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
  pointer-events: auto;
  box-shadow: 0 1px 3px rgba(15,23,42,0.06);
}
.layer-toggle.is-hidden {
  opacity: 0.5;
  background: var(--soft);
}
.layer-toggle:hover {
  border-color: var(--teal);
}
```

**B. 在 app.js 中新增图层状态对象**

```js
const state = {
  // ... 现有 state 保持不变，新增：
  layers: {
    walkRadius: true,    // 步行范围圈
    pois: true,          // 美食/搜索 POI
    rankings: true       // 榜单标记
  }
};
```

**C. 图层切换逻辑**

```js
function toggleLayer(layerKey) {
  state.layers[layerKey] = !state.layers[layerKey];
  // 重新渲染对应的图层
  if (layerKey === 'walkRadius') {
    // 切换步行范围圈的显隐（已有的 circle overlay）
    document.querySelectorAll('.amap-circle').forEach(el => ...)
    // 或重新调用 renderRankingLayer / renderNearbyMap 等
  }
  if (layerKey === 'pois') {
    // 切换 POI 标记显隐
  }
  if (layerKey === 'rankings') {
    // 切换榜单标记显隐
  }
  renderLayerToggles();
}
```

**更简单的方法**：为每个 overlay 数组加一个 filter，在渲染循环中检查 `state.layers`。

具体可以在 `clearMap()` 和 `renderRankingLayer()` / `renderNearbyMap()` / `renderAgentMap()` 中加入条件判断：当 `state.layers.pois === false` 时，跳过 POI 标记的添加（但步行圈独立控制）。

或者在每次渲染后，遍历对应的 overlays/rankingOverlays 数组，根据图层状态设置 `setMap(null)` 或 `setMap(map)`。

**D. 在 renderToolbar / renderRankingToolbar 中渲染 Toggle**

在 `renderRankingToolbar()` 函数末尾（或在 mapWrap 中榜单工具栏下方）追加图层切换条：

```js
function renderLayerToggles() {
  const mapWrap = document.querySelector('.map-wrap');
  if (!mapWrap) return;
  mapWrap.querySelector('.layer-toggles')?.remove();

  const container = document.createElement('div');
  container.className = 'layer-toggles';
  container.innerHTML = `
    <button class="layer-toggle ${state.layers.walkRadius ? '' : 'is-hidden'}" data-layer="walkRadius">
      ${state.layers.walkRadius ? '◎' : '○'} 步行范围
    </button>
    <button class="layer-toggle ${state.layers.pois ? '' : 'is-hidden'}" data-layer="pois">
      ${state.layers.pois ? '◎' : '○'} 美食/店铺
    </button>
    <button class="layer-toggle ${state.layers.rankings ? '' : 'is-hidden'}" data-layer="rankings">
      ${state.layers.rankings ? '◎' : '○'} 全部榜单
    </button>
  `;

  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleLayer(btn.dataset.layer);
    });
  });

  mapWrap.appendChild(container);
}
```

CSS 中给 `.layer-toggles` 定位：

```css
.layer-toggles {
  position: absolute;
  left: 18px;
  bottom: 42px;
  z-index: 5;
  display: flex;
  gap: 6px;
  pointer-events: none;
}
.layer-toggle {
  pointer-events: auto;
}
```

在移动端做调整：

```css
@media (max-width: 767px) {
  .layer-toggles {
    left: 10px;
    bottom: 10px;
    gap: 4px;
  }
  .layer-toggle {
    font-size: 10px;
    padding: 3px 8px;
  }
}
```

注意不要在榜单按钮上面重叠。要考虑 z-index 和位置偏移。

### 验收标准

1. 页面加载后，地图上可见步行范围圈、美食店铺、榜单标记
2. 点击"步行范围"toggle → 步行范围虚线圆隐藏（不删除，只是不再显示）
3. 再次点击 → 恢复显示
4. 点击"美食/店铺"toggle → 所有 POI 标记（非榜单标记）隐藏
5. 重新搜索/刷新结果后，toggle 状态保留
6. 移动端 toggle 正常可用

---

## 任务 3："全部榜单"切换逻辑优化

### 需求背景

当前榜单工具栏（ranking-toolbar）默认 mode 是 "all"，显示全部榜单。用户觉得一次性展示太多店铺标记很重，希望点击"全部榜单"按钮可以暂时隐藏所有榜单标记，再次点击恢复。

### 改动要求

修改 `renderRankingToolbar()` 中的 "全部榜单" 按钮行为：

当前逻辑：
- `"all"` mode → 显示全部榜单店铺

修改为 toggle 逻辑：

```js
// 在 ranking-filter--all 的 click handler 中
button.addEventListener('click', () => {
  const currentMode = state.rankings.mode;
  if (currentMode === 'all') {
    state.rankings.mode = 'none';   // 新增 mode：隐藏所有
  } else {
    state.rankings.mode = 'all';    // 恢复全部
  }
  renderRankingToolbar();
  renderRankingLayer();
});
```

在 `filterRankingMarkers()` 函数中增加 `"none"` 的处理：

```js
function filterRankingMarkers(markers) {
  if (state.rankings.mode === 'none') return [];  // 不返回任何标记
  if (state.rankings.mode === 'all') return markers;
  // ... 其余逻辑不变
}
```

"全部榜单"按钮在 `mode === 'none'` 时的视觉反馈：降低透明度或显示为灰色轮廓。

```css
.ranking-filter--all.is-none {
  opacity: 0.5;
  background: transparent;
  border-color: var(--line);
}
```

或者在 `renderRankingToolbar` 中根据 mode 给 all 按钮加一个 class：

```js
// 全部榜单按钮的 class
`ranking-filter ranking-filter--all${state.rankings.mode === 'none' ? ' is-none' : ''}${state.rankings.mode === 'all' ? ' is-active' : ''}`
```

### 验收标准

1. 默认"全部榜单"高亮，地图上展示所有榜单标记
2. 点击"全部榜单"→ 隐藏所有榜单标记，按钮变为非高亮/灰色状态
3. 再次点击"全部榜单"→ 恢复所有榜单标记
4. 点击其他榜单（必吃榜/扫街榜等）→ 正常筛选，不受全部榜单 toggle 影响
5. 从其他榜单切回"全部"时恢复正常

---

## 任务 4：榜单 InfoWindow 添加收藏按钮

### 需求背景

当前搜索结果卡片已有收藏心形按钮，但地图上点击榜单标记弹出的 `rankingInfoWindow` 还没有收藏功能。

### 改动要求

在 `openRankingInfo()` 函数中，在 infoWindow 的内容底部增加一个收藏按钮。

```js
function openRankingInfo(entry, position) {
  if (!rankingInfoWindow || !map) return;
  const price = entry.price ? `人均 ${escapeHtml(String(entry.price))}` : '人均未标注';
  const cuisine = entry.cuisine ? escapeHtml(entry.cuisine) : '菜系未标注';
  const labels = (entry.labels || []).map((label) => `<span>${escapeHtml(label)}</span>`).join('');

  // 构建一个兼容收藏的数据结构
  const favRecord = normalizeFavoriteRecord({
    id: `poi-${cleanText(entry.name)}-${cleanText(entry.address)}`,
    name: entry.name,
    address: [entry.district, entry.area, entry.address].filter(Boolean).join(' '),
    location: entry.location,
    type: entry.cuisine || '',
    rankingLabels: entry.labels || [],
    savedAt: new Date().toISOString()
  });
  const isFaved = isFavoriteId(favRecord.id);

  rankingInfoWindow.setContent(`
    <div class="ranking-info-window">
      <strong>${escapeHtml(entry.name)}</strong>
      <div class="ranking-info-tags">${labels}</div>
      <p>${cuisine} · ${price}</p>
      <p>${escapeHtml([entry.district, entry.area, entry.address].filter(Boolean).join(' · '))}</p>
      <div class="ranking-info-actions">
        <button class="ranking-fav-btn${isFaved ? ' is-faved' : ''}" type="button" data-fav-id="${escapeHtml(favRecord.id)}">
          <svg class="fav-heart-icon" viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
            <path d="M12 20.8 4.9 13.9a4.8 4.8 0 0 1 0-6.9 5 5 0 0 1 7 0l.1.1.1-.1a5 5 0 0 1 7 0 4.8 4.8 0 0 1 0 6.9Z" fill="${isFaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>${isFaved ? '已收藏' : '收藏'}</span>
        </button>
      </div>
    </div>
  `);

  // 为收藏按钮绑定事件（infoWindow 打开后手动绑定）
  // 使用 setTimeout 确保 DOM 已渲染
  setTimeout(() => {
    const favBtn = document.querySelector('.ranking-fav-btn');
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavoriteRecord(favRecord);
        // 关闭 infoWindow 或刷新内容
        rankingInfoWindow.close(map);
        showToast(isFaved ? '已取消收藏' : '已加入收藏');
      });
    }
  }, 50);
  rankingInfoWindow.open(map, position);
}
```

新增 CSS：

```css
.ranking-info-actions {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}
.ranking-fav-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  border-radius: 999px;
  background: var(--soft);
  color: var(--muted);
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.ranking-fav-btn:hover {
  background: #fef2f2;
  color: #dc2626;
}
.ranking-fav-btn.is-faved {
  background: #fef2f2;
  color: #dc2626;
}
.ranking-fav-btn .fav-heart-icon {
  stroke: currentColor;
}
```

### 验收标准

1. 在地图上的上海三榜区域，点击任意榜单标记 → infoWindow 弹出
2. infoWindow 底部显示收藏按钮（默认空心心形 + "收藏"文字）
3. 点击收藏 → 心形变红 + "已收藏"
4. 收藏的数据存入 localStorage（与现有搜索结果卡片共享同一份数据）
5. 切换到收藏面板，该店出现在列表中
6. 再次点击已收藏店铺的标记 → infoWindow 心形默认红 + "已收藏"

---

## 任务 5：移动端搜结果地图标记支持点击查看详情

### 需求背景

移动端搜索或附近查询后，地图上生成的大头针标记（搜索结果 POI）目前没有点击事件。用户无法在地图上点击一个标记来了解店铺信息。

### 改动要求

在 `renderNearbyMap()` 和 `renderAgentMap()` 中，为每个生成的 Marker 绑定 click 事件，弹出一个简化的 infoWindow。

**A. 通用 infoWindow 创建**

```js
// 在 map 初始化后创建一个通用的 poi infoWindow
let poiInfoWindow = null;

// 在 initMap 中初始化
poiInfoWindow = new window.AMap.InfoWindow({
  offset: new window.AMap.Pixel(0, -24),
  closeWhenClickMap: true
});
```

**B. 为 POI 标记绑定 click**

在 `renderNearbyMap()` 中，创建 marker 后绑定：

```js
const marker = new window.AMap.Marker({
  position: point,
  title: poi.name,
  label: {
    content: `<div class="map-label cluster">${index + 1}</div>`,
    direction: 'top'
  }
});
marker.on('click', () => {
  poiInfoWindow.setContent(`
    <div class="poi-info-window">
      <strong>${escapeHtml(poi.name)}</strong>
      <p>${escapeHtml([poi.district, poi.address].filter(Boolean).join(' · '))}</p>
      <p>${poi.distance ? `距离约 ${formatDistance(poi.distance)}` : ''}</p>
    </div>
  `);
  poiInfoWindow.open(map, point);
});
marker.setMap(map);
```

同样在 `renderAgentMap()` 中为搜索结果的 marker 绑定同样的 click 事件。

**C. 新增的 CSS**

```css
.poi-info-window {
  min-width: 160px;
  max-width: 240px;
  display: grid;
  gap: 6px;
  color: var(--text);
}
.poi-info-window strong {
  font-size: 13px;
}
.poi-info-window p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}
```

### 验收标准

1. 在移动端搜索后，地图上的 POI 标记可以点击
2. 点击标记弹出窗口显示店名、地址、距离
3. 点击地图空白处或关闭按钮，窗口关闭
4. 榜单标记的点击不受影响（原有 infoWindow 仍正常工作）

---

## 任务 6：桌面端左侧 Panel 宽度优化

### 需求背景

当前桌面端 `.left-side-panel` 固定 `width: 420px`，占了约 30% 的屏幕宽度。地图是核心展示区，左侧面板偏厚。

### 改动要求

将桌面端的左侧面板宽度从 420px 调整为 380px（压缩 40px 给地图）。

```css
.left-side-panel {
  width: 380px;  /* 原 420px */
  /* 其余不变 */
}
```

同时检查内部的 `grid-template-rows` 和 padding 是否有溢出，确保 380px 下内容仍然完整可读。特别检查：

- `brand-joint-badge` 中品牌名 + logo 是否折行
- 快捷标签在 380px 下是否正常换行
- 对话气泡和 place-card 的 padding 是否合理

### 验收标准

1. 桌面端 1280px 宽度下左侧面板宽度为 380px
2. 面板内所有内容完整显示，品牌标识无折行
3. 地图区域相应变宽
4. 宽度变化后收藏面板、对话面板的圆角等视觉元素正常

---

## 任务 7：移动端默认地图高度扩大

### 需求背景

当前移动端 `right-map-container` 的 `min-height: var(--mobile-map-min)` 即 `clamp(11rem, 30dvh, 24rem)`，约 250-380px。在没有消息时，地图是主要视觉区，应该更大。

### 改动要求

将无消息时的地图最小高度放大：

```css
@media (max-width: 767px) {
  :root {
    --mobile-map-min: clamp(14rem, 45dvh, 30rem);  /* 原 clamp(11rem, 30dvh, 24rem) */
  }

  body.has-messages .right-map-container {
    min-height: 160px;  /* 有消息时缩小 */
  }
}
```

同时确保 `body:not(.has-messages)` 时，地图确实占据主要视觉比例。

### 验收标准

1. 首次打开移动端页面，地图高度约 45dvh（约 380px），视觉突出
2. 发送一条消息后，地图自动缩小到 160px 左右
3. 重置上下文（清空消息）后，地图恢复初始大小
4. 地图缩小后，地图上的标记和控件仍然可操作

---

## 任务 8：新用户首次使用轻量引导

### 需求背景

新用户打开页面后可能不知道这个产品能做什么，仅凭地图上的店铺标记和输入框难以快速建立心智模型。

### 改动要求

在页面首次加载时（判断 localStorage 中无访问记录），在输入框上方显示一个轻量的引导提示条，持续 6 秒后自动消失。如果用户已操作过（发过消息或点击过任何按钮），不再显示。

```js
function showFirstVisitGuide() {
  const visited = localStorage.getItem('amap_guided');
  if (visited) return;

  const guide = document.createElement('div');
  guide.className = 'first-visit-guide';
  guide.innerHTML = `
    <div class="guide-content">
      <span class="guide-icon">👋</span>
      <div>
        <strong>试试这样问：</strong>
        <p>“附近有什么必吃榜的餐厅”<br>“步行10分钟内的咖啡馆”<br>“上海市中心有什么值得去的地方”</p>
      </div>
      <button class="guide-dismiss" type="button" aria-label="关闭提示">✕</button>
    </div>
  `;
  document.querySelector('.ask-card')?.prepend(guide);

  // 6 秒后自动消失
  const dismiss = () => {
    guide.classList.add('is-dismissing');
    setTimeout(() => guide.remove(), 400);
    localStorage.setItem('amap_guided', '1');
  };
  guide.querySelector('.guide-dismiss')?.addEventListener('click', dismiss);
  setTimeout(dismiss, 6000);
}
```

在 `init()` 中合适的位置调用 `showFirstVisitGuide()`。

新增 CSS：

```css
.first-visit-guide {
  margin-bottom: 14px;
  padding: 12px 14px;
  background: linear-gradient(180deg, #f0f9f6, #e6f4f1);
  border-radius: 12px;
  box-shadow: 0 4px 12px -6px rgba(0, 122, 100, 0.15);
  animation: guideSlideIn 400ms ease-out;
  transition: opacity 400ms ease, transform 400ms ease;
}
.first-visit-guide.is-dismissing {
  opacity: 0;
  transform: translateY(-10px);
}
.guide-content {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.guide-icon {
  font-size: 24px;
  line-height: 1;
}
.guide-content strong {
  display: block;
  color: var(--text);
  font-size: 13px;
  margin-bottom: 4px;
}
.guide-content p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
.guide-dismiss {
  flex: none;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
  cursor: pointer;
  padding: 2px;
}
@keyframes guideSlideIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

在移动端适配：

```css
@media (max-width: 767px) {
  .first-visit-guide {
    padding: 10px 12px;
  }
  .guide-icon {
    font-size: 20px;
  }
  .guide-content p {
    font-size: 11px;
  }
}
```

### 验收标准

1. 首次打开页面（清空 localStorage），在输入框上方出现引导提示
2. 引导内容包含 2-3 个示例提问方式
3. 点击关闭按钮或 6 秒后自动消失，不再显示
4. 刷新页面后不再显示（localStorage 已标记）
5. 移动端显示正常，不遮挡输入框

---

## 执行顺序建议

1. **任务 6**（桌面端面板宽度）—— CSS 改动，几乎无风险
2. **任务 3**（全部榜单 toggle）—— 纯 JS 逻辑，改动量小
3. **任务 2**（图层 toggle）—— 中等改动
4. **任务 4**（infoWindow 收藏）—— 中等改动
5. **任务 5**（地图标记点击）—— 中等改动
6. **任务 1**（对话区空间优化）—— 涉及 CSS + JS，影响面大
7. **任务 7**（移动端地图高度）—— 与任务 1 联动
8. **任务 8**（首次引导）—— 独立改动

---

## 验收总清单

- [ ] 移动端对话区可展示 3-4 条消息不需频繁滚动
- [ ] "思考中"消息在结果到达后自动隐藏
- [ ] 移动端 place-card 变紧凑，信息密度提升
- [ ] 移动端地图在有消息时自动缩小
- [ ] 首次使用有引导提示
- [ ] 可独立控制步行范围圈的显示/隐藏
- [ ] 可独立控制美食/店铺标记的显示/隐藏
- [ ] 可独立控制榜单标记的显示/隐藏
- [ ] "全部榜单"按钮可切换显隐
- [ ] 榜单 infoWindow 有收藏按钮
- [ ] 搜索结果标记可点击查看详情
- [ ] 桌面端左侧面板从 420px 调整为 380px
- [ ] 桌面端功能和布局不受影响
- [ ] 移动端 375px 和 390px 宽度下布局正常、无溢出
