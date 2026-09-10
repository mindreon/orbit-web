# orbit-web

Orbit web UI shell. W0 is **docs + empty navigation** only: no auth, no chat send, no HITL actions, no real API calls.

The browser talks to **orbit-control** only. Temporal, dsh, and LLM runtimes stay behind control — they are never imported or called from this app.

## W0 scope

- Locked nav: **Agents / Rooms / Approvals / Settings**
- Default landing: **Rooms**
- Approvals unread badge is a static placeholder
- Agents: empty persona region + a separate grey **Cloud Job** card (`「W2」`, disabled, not clickable)
- Consumer link to the orbit-control OpenAPI spec (no generated client yet)

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — process boundary and forbidden browser dependencies
- [docs/ia-w0.md](./docs/ia-w0.md) — wireframe-level information architecture (Aura-aligned, no design tokens)
- [openapi/consumer.yaml](./openapi/consumer.yaml) — OpenAPI consumer declaration

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `/` redirects to `/rooms`.

```bash
npm run lint
npm run build
```

## Non-goals (W0)

Real chat, HITL UI beyond an empty Approvals list stub, design tokens / visual polish, authentication, and any Temporal, dsh, or LLM SDK in the browser.
