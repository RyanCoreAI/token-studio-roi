# Token Studio ROI

[English](README.en.md) | **中文**

Token Studio ROI 是一个本地隐私优先的 **Local AI Coding ROI Studio**：它不只记录 token 和官方价换算成本，还把 AI 编程用量归因到项目、任务、工作阶段、产出和模型策略，帮助你回答：

- token 花在哪些项目和任务上？
- 哪些 session 真的形成了 PR、commit、文章、部署或文档产出？
- 下周应该用轻量、中等还是重模型，才能用有限 token 做更高 ROI 的事？

默认不读取、不展示、不上传对话正文。真实采集必须显式确认。

## Why Different

| 项目 | 重点 | Token Studio ROI 的差异 |
|---|---|---|
| ccusage | 多 AI coding CLI 用量和成本统计 | Token Studio ROI 重点做工作归因、产出证据和模型策略 |
| CodeBurn | 多 agent 本地成本/TUI | Token Studio ROI 重点做可导出的复盘报告和 ROI evidence |
| token-dashboard | Claude Code 细粒度成本、tool/file heatmap | Token Studio ROI 保持隐私边界，只保存 metadata/hash/文件类型，不保存正文 |
| Claude Code Usage Monitor | burn rate 和实时额度监控 | Token Studio ROI v4.0 先做复盘闭环，v4.1 再补轻量 live 页面 |

更完整的竞品参考和差异化记录见 [docs/competitive-notes.md](docs/competitive-notes.md)。

## Quick Start

推荐 Node.js 24，最低 Node.js `>=22.12.0`。

```bash
git clone https://github.com/RyanCoreAI/token-studio-roi.git
cd token-studio-roi
npm install
npm run demo
```

或通过 CLI：

```bash
node src/cli.mjs demo
node src/cli.mjs start
node src/cli.mjs live
node src/cli.mjs collectors
node src/cli.mjs doctor
node src/cli.mjs privacy-check
```

发布到 npm 后的目标入口：

```bash
npx @ryan/token-studio-roi demo
npx @ryan/token-studio-roi start
npx @ryan/token-studio-roi live
npx @ryan/token-studio-roi collectors
npx @ryan/token-studio-roi collect --sources=claude,codex
npx @ryan/token-studio-roi doctor
npx @ryan/token-studio-roi privacy-check
```

`demo` 使用合成数据，不扫描真实 `.claude`、`.codex`、Cursor 或 Copilot 日志。`start` 只读取已有 SQLite，不自动采集。

真实采集需要显式确认：

```bash
node src/cli.mjs collect --sources=claude,codex
```

非交互环境不会自动扫描本机日志；需要显式 `--yes` 才会继续。

## Core Features

- Collector registry：Claude Code、Codex CLI、Gemini CLI、OpenCode、OpenClaw、Hermes Agent 作为 v4.0 stable 来源。
- Experimental sources：Cursor、GitHub Copilot CLI、Qwen Code、Kimi、Goose 仅在存在明确 token 字段时导入，不伪造 token 或费用。
- Official-price conversion：按官方公开 token 单价换算，未公开美元价的模型保持未定价。
- Work attribution：项目、任务类型、产出状态、工作目的、阶段、价值、备注。
- Output evidence：只保存 URL、标签和类型，不抓取链接内容。
- ROI Evidence Score：检查归因、产出、人工确认和 work item 是否足够支撑 ROI 判断。
- ROI Advisor：本地规则建议，不调用 LLM，不额外消耗 token。
- Model Policy：导出 `MODEL_POLICY.md`，把历史用量转成下周模型使用策略。
- Live Monitor：`/live` 轻量监控最近 15 分钟 token、模型、cache 和 burn rate。
- Privacy check：公开前扫描真实 DB、AI 日志目录、`.env`、导出文件和个人路径。
- Demo mode：公开演示默认使用合成数据并显示 Demo Mode 标识。

## Why Not Just ccusage / CodeBurn?

ccusage、CodeBurn、TokenTracker 和 token-dashboard 更偏 token meter、TUI、实时 burn rate 或工具覆盖。Token Studio ROI 的核心不是替代这些统计器，而是把本地 token 消耗变成可复盘的工作证据：项目、任务、目的、阶段、价值、产出链接、work item、ROI Evidence、Advisor 行动项和 Model Policy。

如果你只想知道今天用了多少 token，ccusage 或 CodeBurn 会更轻。如果你想知道这些 token 换来了什么产出、下周该怎么换模型策略，Token Studio ROI 更适合。

## Privacy Boundary

Token Studio ROI 不保存：

- prompt
- response
- full transcript
- full file path
- command body
- diff content

细粒度分析只允许保存 token 结构、来源、模型、时间、tool category、文件扩展名、repo path hash 和 privacy level。

运行公开检查：

```bash
npm run privacy:check
```

## API

稳定接口：

- `GET /api/data`
- `GET /api/collectors`
- `GET /api/live`
- `GET /api/privacy-check`
- `GET /api/model-policy.md`
- `POST /api/collect`
- `POST /api/session-annotations`
- `POST /api/session-annotations/batch`
- `POST /api/session-outputs`
- `GET /api/auto-attribution/suggestions`
- `POST /api/auto-attribution/apply`
- `POST /api/auto-attribution/undo`
- `POST /api/work-items`
- `POST /api/work-items/link-sessions`
- `DELETE /api/work-items/:id`

所有写接口继续限制为 loopback、local Origin、JSON。服务端不信任 `X-Forwarded-For` 作为本机判断。

## Development

```bash
npm install
npm test
npm run build
npm run privacy:check
```

开发模式：

```bash
npm run dev
```

默认地址：

- UI: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:4173`

## Public Readiness Checklist

- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run privacy:check`
- [ ] demo screenshots come from demo mode
- [ ] `/live` loads from demo mode or temporary SQLite
- [ ] no real `data/usage.sqlite`
- [ ] no `.claude/`, `.codex/`, `.env`
- [ ] no raw conversation content
- [ ] README explains official-price conversion is not a provider invoice
- [ ] NOTICE keeps attribution for the MIT prototype

## License / Attribution

MIT licensed. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

Token Studio ROI is a standalone public packaging and productization effort by ryan. It preserves attribution for the earlier MIT prototype while making the public product, CLI, collector registry, privacy scanner, ROI evidence layer, work item model, advisor, and model policy workflow first-class Token Studio ROI features.
