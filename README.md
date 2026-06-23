# 高德真实查询助手

这是一个聊天主导的本地网页应用，用高德开放平台 Web 服务 API 查询真实 POI、附近地点和步行路线，并用高德 JS API 在右侧显示伴随地图，避免纯 AI 回答时编造地点。

## 你接下来要做什么

1. 登录高德开放平台，进入「应用管理」。
2. 创建一个应用，或使用你已有的应用。
3. 在应用下添加 Key，服务平台选择「Web服务」。
4. 复制本项目的 `.env.example` 为 `.env`，把 Key 填进去：

```ini
AMAP_KEY=你的高德Web服务Key
AMAP_JS_KEY=你的高德Web端JSAPIKey
AMAP_SECURITY_JS_CODE=你的高德JSAPI安全密钥
DEEPSEEK_API_KEY=你的DeepSeekAPIKey
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
PORT=5177
AMAP_MIN_INTERVAL_MS=350
```

5. 在当前目录运行：

```powershell
node server.js
```

6. 打开浏览器访问：

```text
http://localhost:5177
```

## 两个版本

- `http://localhost:5177`：完整功能版。需要 `server.js` 后端，支持 DeepSeek 意图解析、高德 Web 服务查询、高德地图伴随视图、Key 保护、限速和聚合计算。
- `standalone-demo.html`：纯 HTML 单文件 Demo。它不写入你的高德或 DeepSeek Key，不调用后端，只用模拟数据展示 UI 形态。适合预览和分享界面概念，不适合做真实联网产品。

## 已实现的问答

- 多条件共址：直接问「上海哪里同时有影石、大疆和 Apple Store？」或「上海哪里同时有公园和购物中心？」
- 附近搜索：直接问「上海静安寺附近有什么吃的？」
- 步行距离：直接问「上海静安寺到上海人民广场步行多久？」
- POI 搜索：直接问某个品牌、地点或商户。

当前 agent 支持两层：

- 如果配置了 `DEEPSEEK_API_KEY`，用 DeepSeek V4 Flash 把自然语言解析成结构化查询计划。
- 无论是否接入 DeepSeek，真实地点、路线和距离都只来自高德 API；DeepSeek 不直接生成地点事实。
- 如果没有配置 DeepSeek Key，系统会自动回退到规则型 agent。

如果遇到高德返回 `CUQPS_HAS_EXCEEDED_THE_LIMIT`，说明请求太快了。可以把 `.env` 里的 `AMAP_MIN_INTERVAL_MS` 调大，例如 `800` 或 `1200`。

## 怎么分享给别人用

`localhost` 只能在你自己的电脑上访问。要分享给别人，有三种路线：

1. 临时演示：用内网穿透工具把 `http://localhost:5177` 暂时映射成公网地址。适合给朋友看一眼，不适合长期公开。
2. 正式网页：把前端和后端部署到 Vercel、Render、Railway、Fly.io、阿里云/腾讯云轻量服务器等平台，并在平台的环境变量里配置 `AMAP_KEY`。这是最推荐的路线。
3. 小程序：保留当前后端作为 API 服务，再做微信小程序前端。高德 Key 仍然放后端，不放小程序端。

不要把 `.env` 或高德 Key 放到前端代码、GitHub 公开仓库、聊天截图里。线上部署时用平台提供的环境变量或 Secret 功能保存 Key。

## 为什么要有后端

高德 Web 服务 Key 不应该直接放到前端网页里。这个项目让浏览器请求本地 `server.js`，再由后端调用高德接口，后续如果要发布到公网、小程序或桌面软件，也可以沿用这个后端逻辑。

## 备注

「双品牌商圈」不是高德单个接口的直接能力。当前实现会先查询两组品牌门店 POI，再按坐标距离匹配，并查询两家门店中点附近的购物中心、商场、广场作为候选商圈。结果会展示原始门店名、地址和距离，方便你自己核验。
