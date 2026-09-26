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

每个验证步骤用 `verify()`（`e2e/helpers.ts`）记下「步骤 / 期望 / 实际 / 是否通过」，实际值只写和时间、端口、随机 id 无关的内容；帧率、延迟、CLS 这类会浮动的数字用 `metrics()` 另记。

```bash
pnpm exec playwright install --with-deps chromium webkit   # 第一次
CI=1 pnpm test:stack && CI=1 pnpm test:e2e && CI=1 pnpm perf:chat                  # 第一遍 → acceptance-report/
export ACCEPTANCE_OUT=acceptance-report/rerun                                       # 同一提交再跑一遍
CI=1 pnpm test:stack && CI=1 pnpm test:e2e && CI=1 pnpm perf:chat && unset ACCEPTANCE_OUT
pnpm report:acceptance && pnpm report:acceptance acceptance-report/rerun
node e2e/report/compare.mjs acceptance-report acceptance-report/rerun             # 两遍的 report.json 必须逐字节相同
node e2e/report/scan.mjs acceptance-report                                          # 密钥扫描（有 gitleaks 时一并跑）
```

产物 `acceptance-report/`：

| 文件 | 内容 |
|---|---|
| `report.json`、`items/acc-NN.json` | 提交 SHA、各组件和浏览器版本、范围（6、7 留给产物面板 PR）；每一条的期望、实际、是否通过、逐条步骤、截图。不含任何会浮动的值，同一提交跑两遍逐字节相同 |
| `measurements.json` | 实测数字：第 9、13、16 条的关键指标和阈值，以及每个测试的原始数据 |
| `index.md` | 上面两份的可读版 |
| `rerun-comparison.json` | 两遍的 report.json 是否相同（附 sha256），第 9、13、16 条的数字并排和阈值检查 |
| `secret-scan.json`、`gitleaks.json` | 密钥扫描结果：故意埋下的值（栈的内部 token、`turn.failed` 里的假密钥）、环境变量里的密钥、常见密钥格式，加 gitleaks 8.30.1 |
| `screenshots/`、`rerun/` | 截图；第二遍的同样一套文件 |

`pnpm test:stack` 需要本机有 Go 1.23、uv 和 Python 3.11；拉取的代码、控制面二进制和 Temporal CLI 缓存在 `.stack/`。`CI=1` 让每次都起一个新栈。CI（`.github/workflows/e2e.yml`）三组并行、每组在同一提交上跑两遍，最后一个 job 合成、比对、扫描并上传 `acceptance-report` 产物。

`pnpm fixture:chat` 会构建并起一个带固定数据集的本地服务，打开 http://127.0.0.1:18080/task/room-e2e 可以用 DevTools Performance 面板自己测。
