# orbit-web

Orbit 的前端：Vite + React 19 + React Router + Tailwind + TanStack Query。所有数据来自 orbit-control 的 `/v1` 接口，浏览器不直连 Temporal 或模型。v2 重写中：目前只有基础层（见下）和登录、“我”两个页面，其余页面在 WP9 加入。

## 本地运行

```bash
pnpm install
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

`pnpm gen:api` 用 `openapi-typescript` 从 `../orbit-control/docs/openapi.yaml` 生成 `src/api/schema.d.ts`（`ORBIT_OPENAPI` 可指定别处的 spec）；spec 不存在时脚本报错退出。

## 登录

`GET /v1/auth/config` 决定模式。`oidc`：授权码 + PKCE，令牌只放内存，刷新页面会重新走授权（IdP 会话让它无感）；`dev`：`POST /v1/auth/dev/token`，令牌放 sessionStorage 以便刷新后保持登录（仅限本地栈，控制面需要 `ORBIT_AUTH_MODE=dev`）。当前租户通过 `X-Orbit-Tenant` 请求头选择。
