# orbit-web v2

Orbit 多智能体平台的 SPA，使用 Vite 8、React 19、React Router Declarative 模式、Tailwind、TanStack Query。
当前是 WP4 基础层：登录、OIDC 回调、“我”页面、布局、API/SSE 和复用预览。业务页面由 WP9 实现。
不兼容 v1；源码在根目录 `src/`，没有 Next.js。

## 布局与边界

- `src/app/`：路由、布局、鉴权守卫、查询缓存、toast；`auth/` 管理会话。
- `src/api/`：轻量 fetch、类型化错误、SSE、run 事件 reducer、登录接口类型。
- `src/components/files/preview/`：按注册表懒加载文件预览；`src/components/markdown/`：Markdown、安全净化、Mermaid、代码块。
- `src/ui/`：被使用的 UI 原语；`src/lib/`：共享工具；`src/test/`：测试辅助。
- `scripts/`：OpenAPI 版本检查/生成与许可证 NOTICE 校验。
- 设计 token 在 `src/index.css` 与 `tailwind.config.ts`，规范见 `docs/design-system.md`。

## 命令

```sh
pnpm install --frozen-lockfile
pnpm dev                    # localhost:3010；/v1 代理到 control
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm licenses:check
pnpm licenses:write          # 依赖变化后更新 NOTICE 并 review
```

`ORBIT_CONTROL_URL` 改开发代理目标（默认 `http://127.0.0.1:8080`）。
`pnpm gen:api` 读取 `../orbit-control/docs/openapi.yaml`，可用 `ORBIT_OPENAPI` 覆盖路径；
必须是 OpenAPI 3.1.x 且 `info.version` 以 `2.` 开头。WP1 未完成时不要运行生成。
`src/api/auth.ts` 的手写类型留到 WP9 再替换。

## 实现约定

- 先明确假设和可验证结果；只改任务所需内容，保持现有风格，不留未引用组件、占位或推测性抽象。
- 浏览器只访问 `/v1`，不直连 Temporal、模型或数据库；写请求携带 `Idempotency-Key`。
- OIDC 授权码 + PKCE，令牌只在内存；刷新自动重走授权，主动退出的一次性标记保存在 sessionStorage。
  dev token 仅在开发签发模式存 sessionStorage。切租户必须丢弃旧缓存；401 清掉会话和租户选择。
- SSE 游标使用 JetStream `Last-Event-ID`，不是信封 `id`。信封 `id` 用于每个 run 的有界去重。
  新 attempt 丢弃同成员、同段的旧未完成消息。`message.final` 读 `text` 或保留 `contentRef`。
- `reasoning.delta` 的必填 `message_id` 依赖 lead 已约定的 control 契约修订；不写回退逻辑。
- 保持 Markdown 的 DOMPurify + rehype-sanitize、Mermaid SVG 净化和预览隔离；不要直接插入未净化模型输出。
- 新依赖固定版本并更新 lockfile；运行依赖变化需同步 NOTICE。

## 验证

- 修复前先列失败路径并写回归用例，再改实现；不要在写完实现后补镜像实现的单测。
- 逻辑测试使用 Vitest node；组件测试以 `// @vitest-environment jsdom` 按文件切换。
- WP4 用 jsdom 验证认证状态、路由守卫、StrictMode、Markdown XSS 和所有预览器的组件集成。
  PDF/Office SDK 与 Mermaid 输出可用受控边界替身，净化器和应用组件必须真实运行。
- WP9 用 Playwright 对开发栈验证完整旅程并产出可复核的产物；本基础层验收无需 Docker。
- 必须实际运行 typecheck、lint、test、build；按小步提交写清修改原因，不 push。
