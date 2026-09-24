---
name: frontend-permission
description: Maintain frontend access driven by GET /iam/api/v1/authz/endpoints and platform settings menu visibility. Use when adding, changing, auditing, or debugging permission bootstrap, endpoint matchers, menu or module visibility, page and action gates, menu keys, endpoint constants, or their interaction with project capabilities in Netflow or apps derived from web-template.
---

# Frontend Permission

Combine platform menu visibility with the IAM endpoint matrix for frontend access experience. Backend authorization remains the security boundary.

## Inspect First

Before editing, trace the current path end to end:

1. Read `apps/web/app/providers/auth-bootstrap.tsx`, `apps/web/app/stores/permissions.ts`, `apps/web/app/hooks/use-platform-settings.ts`, and `apps/web/app/lib/permissions/`.
2. Find the API wrapper that owns the affected request.
3. Confirm the canonical public path and method in the backend service manifest or the actual `/authz/endpoints` response.
4. Find every menu, route, button, and handler that exposes the operation.

If the repository has `.codegraph/`, use CodeGraph before text search.

Do not guess endpoint patterns. A guessed path combined with deny-by-default behavior can hide valid UI.

## Runtime Contract

The authenticated bootstrap must:

- fetch `users/current` and `authz/endpoints`;
- normalize endpoint paths and HTTP methods;
- store the normalized matrix before authenticated pages render;
- clear the matrix on logout or session teardown.

The login page may load public platform settings, but it must not require the endpoint matrix.

Unknown endpoints and methods that are not explicitly `true` deny by default. Avoid a transient 403 by keeping protected content behind the existing authentication/bootstrap loading state until the matrix is ready.

## Platform Menu Visibility

Read `PlatformSettings.menus` as `{ menuKey, visible }[]`. An absent menu key is visible by default, matching baize-frontend and preserving compatibility when new menus are deployed before platform settings are updated.

Use stable explicit keys for routes containing tenant, project, or resource IDs. Follow the shared namespaces:

- `top.<module>` for top-level modules;
- `console.<module>` for console modules;
- `menu.<scope>.<entry>` for menu entries.

The final result is platform visibility AND endpoint permission AND, in Netflow, the relevant project capability. Apply the same combined result to standalone navigation, Wujie menu reporting, and direct-route access. A hidden direct route shows the standard forbidden state; when a module root is hidden but another child remains visible, redirect to the first visible child.

## Permission API

Keep endpoint permissions expressed as transport contracts:

```ts
const permit = usePermission()
const canCreate = permit('post', PROJECT_ENDPOINTS.keys)
```

Support:

- one tuple: `['get', endpoint]`;
- an array of tuples for all-of;
- `{ anyOf: [...] }` for any-of.

The matcher must normalize method case, query strings, hashes, trailing slashes, dynamic `:id` segments, and terminal `*` wildcards. Add matcher tests when changing these rules.

Do not add a second semantic layer such as `KEY_PERMISSIONS.create`. The request endpoint constant is already the shared contract.

## Endpoint Constants

Put canonical patterns beside the API module that owns the request. Static patterns are for permission checks; runtime helpers are for requests:

```ts
export const PROJECT_ENDPOINTS = {
  keys: '/netflow/api/v1/projects/:projectId/keys',
  key: '/netflow/api/v1/projects/:projectId/keys/:keyId',
  keyPath: (projectId: string, keyId: string) =>
    `/netflow/api/v1/projects/${projectId}/keys/${keyId}`,
} as const
```

Reuse the same constants in request code, menus, page gates, and action checks. Do not scatter raw URL strings through JSX.

## Apply At The Right Level

- Menu: hide an item when platform settings disable its `menuKey` or its primary endpoint is denied.
- Page: use a permission gate for direct route access when the page has a clear primary endpoint.
- Feature: use `usePermission()` for create, edit, delete, import, export, tabs, cards, and optional data blocks.
- Handler: retain a permission check for destructive or shortcut-triggered operations when hiding the button alone is insufficient.

For pages using several endpoints, gate on the primary endpoint and guard optional blocks independently. Use all-of only when every endpoint is required for the page to function; use any-of when any one path makes the feature useful.

Place protected queries inside the gate so denied users do not issue requests that are guaranteed to fail.

## Netflow And Template Variants

Netflow has contextual `ProjectCapabilities` in addition to IAM endpoint permissions:

- endpoint matrix answers whether the account may call the service action;
- project capabilities answer whether the action is valid in the selected project or tenant;
- when platform settings, endpoint permission, and project capability apply, all must allow the UI;
- do not replace project ownership, quota, tenant, or resource-state rules with endpoint checks.

web-template intentionally has no product endpoint catalog. When deriving an app from it, add endpoint constants and consumers only for real backend operations. Do not add placeholder permissions or fake menu gates to the template.

## Verification

Leave the smallest runnable checks that cover the change:

- matcher changes: targeted matcher unit test;
- bootstrap/store changes: targeted bootstrap or store test;
- menu/page/action changes: targeted tests for visible, hidden, and absent platform menu settings plus allowed and denied endpoint states.

Run only targeted tests and ESLint for touched files. Do not run a full build, full test suite, full ESLint, or full TypeScript check unless explicitly requested.
