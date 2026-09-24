# orbit-web

MindBuddy 的可点击前端。技术栈与 `common/web-template` 的 `dev` 分支一致：Vite、React 19、React Router、Tailwind。页面数据是 mock，不连接后端。

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
