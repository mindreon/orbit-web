# orbit-web v2

Orbit 多智能体平台的 SPA，使用 Vite 8、React 19、React Router Declarative 模式、Tailwind、TanStack Query。
当前 WP9（WP9a–WP9i）已完成：登录、“我”、专家与专家团目录、会话与运行回放、收件箱、资产/审核/定时/管理页面均已接入。WJ1–WJ5 的栈验收由 infra 驱动。
不兼容 v1；源码在根目录 `src/`，没有 Next.js。

## 布局与边界

- `src/app/`：路由、布局、鉴权守卫与全局错误边界。
- `src/platform/`：身份适配器、API 单例、租户/工作空间上下文、查询缓存、权限与 toast。
- `src/api/`：生成 API 类型、轻量 fetch、错误、SSE、事件与时间线 reducer。
- `src/features/*/`：按业务划分的功能；跨 feature 只能经对方 `index.ts` 导入，且仅允许 `sessions→teams/interactions/files/runs`、`runs→teams/interactions`、`reviews→assets` 七条边；`catalog` 无出边。`eslint-rules/module-boundaries.js` 实施 lint，`src/test/featureGraph.test.ts` 校验实际图与允许边相等。
- `src/components/`：共享展示组件、文件预览与 Markdown；`src/ui/`：UI 原语；`src/lib/`：共享纯函数。
- `e2e/`：Playwright compose 栈旅程；`src/test/featureGraph.test.ts`：唯一保留的前端架构检查。
- `scripts/`：OpenAPI 版本检查/生成与许可证 NOTICE 校验。
- 设计 token 在 `src/index.css` 与 `tailwind.config.ts`，规范见 `docs/design-system.md`。

## 命令

```sh
pnpm install --frozen-lockfile
pnpm dev                    # localhost:3010；/v1 代理到 control
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm licenses:check
pnpm licenses:write          # 依赖变化后更新 NOTICE 并 review
# 在 orbit-infra 仓库根目录运行栈上 WJ1–WJ5：
bash scripts/v2-web-e2e.sh
# runner 默认选择 --project=stack --project=stack-mobile
```

`ORBIT_CONTROL_URL` 改开发代理目标（默认 `http://127.0.0.1:8080`）。
`pnpm gen:api` 读取 `../orbit-control/docs/openapi.yaml`，可用 `ORBIT_OPENAPI` 覆盖路径；
必须是 OpenAPI 3.1.x 且 `info.version` 以 `2.` 开头。生成的 `src/api/schema.d.ts` 提交入库；
`types.ts` 提供类型别名，`auth.ts` 只保留端点封装。

## 实现约定

- 先明确假设和可验证结果；只改任务所需内容，保持现有风格，不留未引用组件、占位或推测性抽象。
- 浏览器只访问 `/v1`，不直连 Temporal、模型或数据库；写请求携带 `Idempotency-Key`。
- OIDC 授权码 + PKCE，令牌只在内存；刷新自动重走授权，主动退出的一次性标记保存在 sessionStorage。
  dev token 仅在开发签发模式存 sessionStorage。W65 的单租户界面不显示租户/组织或切换入口；control 的 `ORBIT_DEFAULT_TENANT` 使首次登录自动加入。内部租户变化必须丢弃旧缓存；401 清掉会话和租户选择。
- 身份页面只依赖 `platform/identity` 的 `IdentityAdapter`；收件箱经 `InboxSource` 注入数据源，页面不直调 API。模型、密钥、额度页面只读，邀请与会话附件不在 R1。
- SSE 游标使用 JetStream `Last-Event-ID`，不是信封 `id`。每个 run 按成员/段/attempt 的连续前缀高水位与稀疏集合精确去重。
  新 attempt 丢弃同成员、同段的旧未完成消息。`message.final` 读 `text` 或保留 `contentRef`。
- `reasoning.delta` 按契约必填的 `message_id` 归并，不写旧契约回退逻辑。
- 保持 Markdown 的 DOMPurify + rehype-sanitize、Mermaid SVG 净化和预览隔离；不要直接插入未净化模型输出。
- 新依赖固定版本并更新 lockfile；运行依赖变化需同步 NOTICE。

## 验证

- 前端页面行为只由 Playwright e2e 旅程覆盖（WJ1–WJ5，`stack` + `stack-mobile`）；不新增 Vitest 单元/组件测试。2026-10-20 按用户决定删除原前端行为测试与覆盖率阈值。
- `pnpm test` 只运行 `src/test/featureGraph.test.ts` 架构检查及 `eslint-rules/*.test.js`、`scripts/*.test.*` 工具测试。
- WP9 栈旅程从 infra 根目录运行 `bash scripts/v2-web-e2e.sh`，默认以 `--project=stack --project=stack-mobile` 覆盖 WJ1–WJ5；不得以本地 dev server 代替栈验收。
- 必须实际运行 typecheck、lint、test、build；按小步提交写清修改原因，不 push。
