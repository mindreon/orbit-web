# orbit-web

Orbit web UI. The browser talks to **orbit-control** only (`NEXT_PUBLIC_CONTROL_URL`, default `http://127.0.0.1:8080`). Temporal, dsh, and LLM runtimes stay behind control.

W1 Rooms can create a `solo|collab` task with a pinned dsh permission preset,
send or steer a turn, subscribe to SSE, inspect the normalized execution
timeline, and decide HITL approvals. Approvals is a live list of the same
records.

## Nav

- Locked destinations: **Agents / Rooms / Approvals / Settings**
- Default landing: **Rooms**, presented as the conversation-task workbench
- Agents: empty persona region + a separate grey **Cloud Job** card (`「W2」`, disabled)
- Consumer link to the orbit-control OpenAPI spec

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — process boundary and forbidden browser dependencies
- [docs/ia-w0.md](./docs/ia-w0.md) — wireframe-level information architecture
- [openapi/consumer.yaml](./openapi/consumer.yaml) — OpenAPI consumer declaration

## Run

Start orbit-worker (`npm run start:host`) and orbit-control first, then:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `/` redirects to `/rooms`.

```bash
npm run lint
npm run build
```

## Non-goals (W1)

Authentication and any Temporal, dsh, or LLM SDK in the browser. Persona,
Skill, workspace, enterprise connector and artifact management remain explicit
future capabilities; Cloud Agent jobs stay a grey card until W2.
