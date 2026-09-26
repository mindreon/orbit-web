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

首次跑 E2E 前先 `pnpm exec playwright install chromium webkit`（输入法回车的用例在 WebKit 上也跑）。

性能验收用 1000 条消息加一条 5 万字回复的固定数据集（`e2e/fixtures/datasets.mjs`，只给开发和测试用，应用不引用）：

```bash
pnpm perf:chat      # 生产构建上测滚动帧率、打字延迟、流式 CLS，结果和 Chrome trace 写到 perf-results/
pnpm fixture:chat   # 构建后起一个带数据集的本地服务，打开 http://127.0.0.1:18080/task/room-e2e 用 DevTools Performance 面板自己测
```
