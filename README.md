# orbit-web

Orbit 的前端：Vite + React 19 + React Router + Tailwind + TanStack Query。所有数据来自 orbit-control 的 `/v1` 接口，浏览器不直连 Temporal 或模型。v2 重写中：目前只有基础层（见下）和登录、“我”两个页面，其余页面在 WP9 加入。

## 本地运行

```bash
pnpm install --frozen-lockfile
pnpm dev          # http://localhost:3010，/v1 代理到 http://127.0.0.1:8080，用 ORBIT_CONTROL_URL 可以改
pnpm typecheck && pnpm lint && pnpm test
pnpm build && pnpm start
```

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/app/` | 路由、布局、错误边界、全局 toast、查询缓存、登录（`auth/`） |
| `src/api/` | fetch 客户端（`client.ts`）、错误类型、SSE 客户端（`sse.ts`）、run 事件归并（`runEvents.ts`）、登录接口的手写类型（`auth.ts`，WP9 改用生成的 `schema.d.ts`） |
| `src/components/` | 文件预览（`files/`，可插拔，见 `preview/registry.ts`）、Markdown |
| `src/ui/` | UI 原语，设计规范见 `docs/design-system.md` |

## API 类型

`pnpm gen:api` 用 `openapi-typescript` 从 `../orbit-control/docs/openapi.yaml` 生成 `src/api/schema.d.ts`（`ORBIT_OPENAPI` 可指定别处的 spec）；脚本在生成前校验 `openapi` 是 3.1.x 且 `info.version` 以 `2.` 开头，否则失败退出。WP1 完成 v2 规范前不运行生成；`/v1/me` 的手写类型保留到 WP9 替换。

## 登录

`GET /v1/auth/config` 决定模式。`oidc`：授权码 + PKCE，令牌只放内存，刷新页面会自动重新走授权（复用 IdP 会话）；主动退出用 sessionStorage 一次性标记阻止下一次页面加载自动跳转，手动登录仍可用；`dev`：`POST /v1/auth/dev/token`，令牌放 sessionStorage 以便刷新后保持登录（仅限本地栈，控制面需要 `ORBIT_AUTH_MODE=dev`）。当前租户通过 `X-Orbit-Tenant` 请求头选择，切换时清空查询缓存。退出会尽力吊销刷新令牌并结束 IdP 会话。开发构建或 localhost issuer 可使用 HTTP，本地 Keycloak 无需 HTTPS。

## 检查与契约约定

`pnpm test` 的逻辑测试使用 node，认证组件、Markdown 与预览行为测试按文件切换为 jsdom。
`pnpm licenses:check`（也由测试执行）校验直接运行依赖的 NOTICE；改依赖后运行 `pnpm licenses:write` 并 review 差异。

SSE 支持动态 URL/请求头以更新短期 stream_token，401 刷新凭据后只重试一次，终止回调携带当前游标；
45 秒无字节（含心跳）会重连，可用 `idleTimeoutMs` 调整。`Retry-After` 是重试等待的下限。
每个 run 单独持有 reducer state，最近 2048 个已处理信封 `id` 用于有界去重；更早的历史重建从空 state 开始。
`message.final` 使用 `text`，或保留 `contentRef` 供上层加载。`reasoning.delta` 按必填 `message_id` 归并，
依赖下一轮 control 契约修订增加此字段，不提供旧契约回退。
