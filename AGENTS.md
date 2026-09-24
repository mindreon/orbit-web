# MindBuddy

这是 Vite + React Router 的单页应用，源码在仓库根目录的 `src/`，不使用 Next.js。

改界面前先看 `src/model.ts`（事项状态和文案）和 `src/store.ts`（点击后怎么改状态）。

## Testing

- NEVER write unit tests after you write code.
- Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact.
- If you must test a system in isolation, FIRST write all the ways it could fail, THEN write the code.
