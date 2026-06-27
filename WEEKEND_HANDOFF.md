# 周末跨电脑项目交接

更新时间：2026-06-27

## 最重要的结论

只拿 GitHub 仓库链接还不够。家里电脑需要：

1. GitHub 仓库代码。
2. 私密 `.env` 文件，里面有高德和 DeepSeek 密钥。
3. Node.js 18 或更高版本。
4. Git。
5. `CODEX_CONTEXT.md` 和本文件，用来恢复项目上下文。

仓库地址：

```text
https://github.com/s1320654147-sketch/amap-ai-map-assistant.git
```

周末工作分支：

```text
codex/weekend-handoff-20260627
```

Render 线上服务跟踪的是 `main`。在周末分支开发和推送不会主动发布到 Render。

## 家里电脑第一次开始

在 PowerShell 中运行：

```powershell
git clone -b codex/weekend-handoff-20260627 https://github.com/s1320654147-sketch/amap-ai-map-assistant.git
cd amap-ai-map-assistant
```

把私密传输包里的 `.env` 放到仓库根目录，和 `server.js` 同级。

然后运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-home.ps1
npm start
```

浏览器打开：

```text
http://localhost:5177
```

## 在家里打开新 Codex 聊天时

把下面这段话发给 Codex：

```text
请先完整读取 CODEX_CONTEXT.md 和 WEEKEND_HANDOFF.md，再运行 git status、node --check server.js、node --check public/app.js。这个项目周末只在 codex/weekend-handoff-20260627 分支继续，不要推 main、不要部署 Render，除非我明确授权。
```

这两份文档就是跨电脑可携带的项目记忆。Codex 的隐藏聊天状态不会自动跟随 GitHub，因此每次换电脑或新开聊天，都应先让它读取这两个文件。

## 周末开发结束

让 Codex 或 PowerShell 完成：

```powershell
git status
git add server.js public
git commit -m "Weekend progress"
git push origin codex/weekend-handoff-20260627
```

如果还修改了文档或其他代码文件，让 Codex按实际文件暂存，不要使用 `git add .`，避免误提交 `.env` 或私密素材。

## 周一回公司电脑

先不要直接继续改代码。运行：

```powershell
git switch codex/weekend-handoff-20260627
git pull origin codex/weekend-handoff-20260627
npm install
npm start
```

确认周末内容正常后，再决定是否合并到 `main` 并发布 Render。发布必须由用户明确授权。

## 当前项目状态

当前已完成并应保留：

- DeepSeek 负责意图理解，高德负责真实地点、距离、路线和 POI 数据。
- 支持 `nearby / route / cluster / travel / search`。
- “人民广场附近本帮菜，步行15分钟，推荐3个”核心路径已修复。
- 证据列表支持查看更多。
- 顶部和底部发送按钮有并发锁。
- 未录入榜单的城市不会跨城市显示上海榜单，会走高德周边兜底。
- 周边和榜单结果按距离排序，评分使用高德真实 rating。
- `travel` 返回真实旅行候选，不虚构完整路线。
- 右上角箭头按钮已改为“AI 灵感探索”，会随机生成提示词并自动发送。
- `normalizeCityDisplay is not defined` 页面报错已在本地修复。

最新两项“AI 灵感探索 + 报错修复”此前只在本地，已包含在本周末分支。

## 私密文件与源素材

`.env` 绝不能提交 GitHub、发到群聊或放公共网盘。

本机私密传输包包含：

- `.env`
- 三份上海榜单源 CSV
- 三张未跟踪的原始图片
- 私密传输说明

这些 CSV/图片不是网站当前运行的必需项，因为运行使用的 `data/lists.json`、`data/lists.resolved.json` 和 `public/assets/` 已在 GitHub；但建议保留，方便后续重新整理榜单和视觉素材。

## 可用上下文说明

项目里能跨电脑携带的完整上下文都已集中在：

- `CODEX_CONTEXT.md`
- `WEEKEND_HANDOFF.md`
- Git 提交历史

如果“胡总”在其他聊天、会议或文档里还有没有写进项目的要求，那些内容无法从当前仓库自动恢复，需要把原文或文件另行带到家里。本文件已涵盖当前工作区和已读取历史中可获得的项目决策。
