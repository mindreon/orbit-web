# orbit-web

Orbit 的前端：Vite + React 19 + React Router + Tailwind + TanStack Query。数据来自 orbit-control 的 `/v1` 接口，浏览器不直连 Temporal 或模型。WP9（WP9a–WP9i）已完成，包含专家/专家团目录、会话、运行回放、收件箱、资产与审核、定时任务及管理页面。

## 本地运行

```bash
pnpm install --frozen-lockfile
pnpm dev          # http://localhost:3010，/v1 代理到 control（ORBIT_CONTROL_URL 可改）
pnpm typecheck && pnpm lint && pnpm test
pnpm build && pnpm start
```

栈上 WJ1–WJ5 从 orbit-infra 根目录运行 `bash scripts/v2-web-e2e.sh`，使用 Playwright `--project=stack --project=stack-mobile`；不要用本地 dev server 代替交付栈验收。

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/app/` | 路由、布局、鉴权守卫、错误边界 |
| `src/platform/` | 身份适配层、API 单例、租户与工作空间上下文、查询缓存、权限、toast |
| `src/api/` | 生成的 API 类型、fetch/SSE 客户端、事件与时间线 reducer |
| `src/features/` | 业务功能；跨 feature 只经 `index.ts` 导入，仅允许 `sessions→teams/interactions/files/runs`、`runs→teams/interactions`、`reviews→assets` 七条边；`catalog` 无出边。lint 与 `featureGraph.test.ts` 强制边界及实际图相等 |
| `src/components/` | 共享展示组件、文件预览、Markdown |
| `src/ui/` | UI 原语；设计规范见 `docs/design-system.md` |
| `e2e/` | Playwright 栈上旅程（从 infra 脚本驱动） |

## API 类型

`pnpm gen:api` 用 `openapi-typescript` 从 `../orbit-control/docs/openapi.yaml` 生成并提交 `src/api/schema.d.ts`（`ORBIT_OPENAPI` 可指定别处的 spec）；脚本在生成前校验 `openapi` 是 3.1.x 且 `info.version` 以 `2.` 开头，否则失败退出。`types.ts` 提供生成类型的别名，`auth.ts` 只封装登录端点。

## 登录

`GET /v1/auth/config` 决定模式。`oidc`：授权码 + PKCE，令牌只放内存，刷新页面会自动重新走授权（复用 IdP 会话）；主动退出用 sessionStorage 一次性标记阻止下一次页面加载自动跳转，手动登录仍可用；`dev`：`POST /v1/auth/dev/token`，令牌放 sessionStorage 以便刷新后保持登录（仅限本地栈，控制面需要 `ORBIT_AUTH_MODE=dev`）。W65 的单租户界面不展示租户/组织概念或切换入口；control 的 `ORBIT_DEFAULT_TENANT` 使首次登录自动加入默认租户，后端保留 `tenant_id` 与 `X-Orbit-Tenant`。内部租户变化清空查询缓存，无成员资格时显示“账号尚未开通，请联系管理员”与账号 ID。退出会尽力吊销刷新令牌并结束 IdP 会话。开发构建或 localhost issuer 可使用 HTTP，本地 Keycloak 无需 HTTPS。

登录通过 `platform/identity` 的 `IdentityAdapter` 隔离，收件箱通过 `features/interactions/inbox/inboxSource.ts` 的 `InboxSource` 注入数据源，两者只实现最小能力。无邀请；模型、密钥与额度在网页只读，写入仍用 `orbit-admin`；会话附件延后 R2。

## 检查与契约约定

`pnpm test` 只运行 `src/test/featureGraph.test.ts` 架构检查及 `eslint-rules/*.test.js`、`scripts/*.test.*` 工具测试。2026-10-20 按用户决定删除其余前端单元/组件测试及覆盖率阈值；页面行为只由 Playwright e2e 旅程覆盖（WJ1–WJ5，`stack` + `stack-mobile`），不新增 Vitest 单元/组件测试。
`pnpm licenses:check` 校验直接运行依赖的 NOTICE；改依赖后运行 `pnpm licenses:write` 并 review 差异。

SSE 支持动态 URL/请求头以更新短期 stream_token，401 刷新凭据后只重试一次，终止回调携带当前游标；
45 秒无字节（含心跳）会重连，可用 `idleTimeoutMs` 调整。`Retry-After` 是重试等待的下限。
每个 run 单独持有 reducer state，按成员/段/attempt 的连续前缀高水位与稀疏集合精确去重；更早的历史重建从空 state 开始。
`message.final` 使用 `text`，或保留 `contentRef` 供上层加载。`reasoning.delta` 按契约必填的 `message_id` 归并，不提供旧契约回退。
