import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import rule from "./module-boundaries.js";
RuleTester.describe = describe;
RuleTester.it = it;
const root = "/project/src/";
const item = (file, code) => ({ filename: root + file, code });
new RuleTester({ languageOptions: { parser: tseslint.parser, ecmaVersion: "latest", sourceType: "module" } }).run("module-boundaries", rule, {
  valid: [
    item("ui/Button.tsx", 'import { cn } from "../lib/cn"'),
    item("components/Card.tsx", 'import type { Asset } from "../api/types"'),
    item("features/sessions/Page.tsx", 'import { TeamBoard } from "../teams"'),
    item("features/catalog/Page.tsx", 'import { api } from "../../platform/client"'),
    item("platform/identity/index.ts", 'export { controlIdentity } from "./control/adapter"'),
    item("features/interactions/inbox/inboxSource.ts", 'import { api } from "../../../platform/client"'),
    item("ui/Dialog.tsx", 'import * as Dialog from "@radix-ui/react-dialog"'),
  ],
  invalid: [
    item("features/assets/Page.tsx", 'import { auth } from "../../platform/client"'),
    item("platform/client.ts", 'export { AuthController } from "./identity/control/controller"'),
    item("features/interactions/inbox/InboxPage.tsx", 'import { fetchMe } from "../../../api/auth"'),
    item("features/interactions/inbox/InboxPage.tsx", 'import { ApprovalCard } from "../ApprovalCard"'),
    item("ui/Thing.tsx", 'import { api } from "../api/client"'),
    item("lib/tool.ts", 'import { Button } from "../ui/Button"'),
    item("api/client.ts", 'import { useState } from "react"'),
    item("platform/store.ts", 'export { Page } from "../features/sessions"'),
    item("components/Card.tsx", 'import { client } from "../api/client"'),
    item("features/catalog/Page.tsx", 'import { Page } from "../sessions"'),
    item("features/sessions/Page.tsx", 'import { TeamBoard } from "../teams/TeamBoard"'),
    item("app/routes.tsx", 'const page = import("../features/sessions/Page")'),
    item("features/assets/Page.tsx", 'import { AuthController } from "../../platform/identity/control/controller"'),
    item("features/interactions/inbox/InboxPage.tsx", 'import { api } from "../../../platform/client"'),
    item("features/interactions/inbox/InboxPage.tsx", 'export { createApiClient } from "../../../api/client"'),
    item("features/assets/Page.tsx", 'import * as Tabs from "@radix-ui/react-tabs"'),
  ].map((test) => ({ ...test, errors: [{ messageId: "boundary" }] })),
});
