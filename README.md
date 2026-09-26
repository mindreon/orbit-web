# orbit-web

MindBuddy 的可点击前端。技术栈与 `common/web-template` 的 `dev` 分支一致：Vite、React 19、React Router、Tailwind。事项的创建、列表和对话走 orbit-control 的 `/v1/rooms`。确认卡、停止和接着说、右栏轨迹也走同一套房间接口。产物、文件、变更和预览在没有文件接口时显示云端空状态。能力页仍是演示。

## 本地运行

```bash
pnpm install
pnpm dev
```

打开 [http://localhost:3010](http://localhost:3010)。

```bash
pnpm typecheck
pnpm build
pnpm start
```

`pnpm start` 用 Vite preview 在 3000 端口提供构建结果。源码在仓库根目录的 `src/`。

`pnpm dev` 默认把 `/v1` 代理到 `http://127.0.0.1:8080`，用 `ORBIT_CONTROL_URL` 可以改。

## 任务对话的事件流

任务台对话只读 orbit-control 的 `GET /v1/rooms/{id}/activity` 和 `GET /v1/rooms/{id}/events`（SSE，断线重连时带 `Last-Event-ID`），发送走 `POST /v1/rooms/{id}/messages`。事件类型由 orbit-runtime 的 JSON Schema 生成，版本钉在 `scripts/gen-events.mjs` 里：

```bash
pnpm gen:events   # 重新生成 src/lib/events/orbit-event.gen.ts
pnpm test:e2e     # 断线重连清草稿、reset 重建两条 E2E，报告在 playwright-report/
```

首次跑 E2E 前先 `pnpm exec playwright install chromium`。
