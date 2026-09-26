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
```

## 验收测试

不写单元测试。验收单上的每一条都由 Playwright E2E 覆盖，测试用 `@acc-N` 标签注明覆盖哪一条。一共三组，最后合成一份验收报告：

| 命令 | 跑在哪里 | 覆盖什么 |
|---|---|---|
| `pnpm test:stack` | 真实栈，假模型模式：Temporal + orbit-control + orbit-orch + orbit-worker（`ORBIT_MODEL_MODE=mock`）+ orbit-web 生产构建，由 `e2e/stack/up.mjs` 拉起，版本钉在脚本里 | 流式回复、审批、停止、子助手、断线续传和 reset、安全、复制和 375px、自动滚动和 CLS、输入框（含 WebKit）、5 万字回复的性能 |
| `pnpm test:e2e` | `e2e/fake-control.mjs`，按脚本发事件的假 control | 假模型不能按需造出来的情况：精确时刻断线、重复和乱序的片段、`turn.failed`、子助手路径、1000 条消息、加载和出错状态；另有依赖许可证检查 |
| `pnpm perf:chat` | 生产构建加固定数据集（`e2e/fixtures/datasets.mjs`：1000 条消息 + 一条 5 万字回复） | 滚动帧率、打字延迟、流式 CLS、首屏包体积 |

```bash
pnpm exec playwright install --with-deps chromium webkit   # 第一次
pnpm test:stack && pnpm test:e2e && pnpm perf:chat
pnpm report:acceptance    # 合成 acceptance-report/：report.json、items/acc-NN.json、index.md、截图
```

`pnpm test:stack` 需要本机有 Go 1.23、uv 和 Python 3.11；拉取的代码、控制面二进制和 Temporal CLI 缓存在 `.stack/`。CI（`.github/workflows/e2e.yml`）三组并行跑，最后上传 `acceptance-report` 产物，里面有每一条验收的结果、截图和性能数字。

`pnpm fixture:chat` 会构建并起一个带固定数据集的本地服务，打开 http://127.0.0.1:18080/task/room-e2e 可以用 DevTools Performance 面板自己测。
