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
