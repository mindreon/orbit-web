# orbit-web

Orbit 的前端：任务中心（TaskWorkflow）、专家、技能和连接器。技术栈：Vite、React 19、React Router、Tailwind。所有数据来自 orbit-control 的 `/v1` 接口，浏览器不直连 Temporal 或模型。

## 本地运行

```bash
pnpm install
pnpm dev          # http://localhost:3010，/v1 代理到 http://127.0.0.1:8080，用 ORBIT_CONTROL_URL 可以改
pnpm typecheck
pnpm build && pnpm start
```

## 任务事件流

任务页读 `GET /v1/tasks/{id}/events`（SSE，重连时带 `Last-Event-ID`），事件由 `src/lib/taskEvents.ts` 归并成界面状态，`src/lib/useTaskStream.ts` 管订阅。持久事件有 `seq`，流式片段没有。

## 验收测试

不写单元测试，每一阶段由 Playwright E2E 覆盖。

| 命令 | 跑在哪里 | 覆盖什么 |
|---|---|---|
| `pnpm test:stack` | 真实栈：Temporal + orbit-control + orbit-runtime（orch、worker）+ Postgres + MinIO + orbit-web 生产构建，由 `e2e/stack/up.mjs` 拉起 | E1–E66 任务验收（含专家团的群聊、@ 提及），`real-model.spec.ts` 需要 `.env` 里配置真实模型 |
| `pnpm test:e2e` | 只起 vite，任务接口用 `page.route` 模拟 | 任务页的渲染；依赖许可证检查 |

`pnpm test:stack` 需要 Docker、Go、uv 和 Python 3.11。每个场景同时检查页面和后端事实；结果看 Playwright 报告（`playwright-report-stack/`，CI 里作为产物上传）。
