# orbit-web

Orbit web UI. The browser talks to **orbit-control** only.

- Local `next dev`: set `NEXT_PUBLIC_CONTROL_URL` (default `http://127.0.0.1:8080`).
- Compose one-click: leave `NEXT_PUBLIC_CONTROL_URL` empty so the UI uses
  same-origin `/v1` through the Caddy edge on a single host port.

W1 Rooms can create a `solo|collab` task with a pinned permission preset
(`workspace-write`, `read-only`, or `danger-full-access`),
send or steer a turn, subscribe to SSE, inspect the normalized execution
timeline, and decide HITL approvals. Approvals is a live list of the same
records.

## Container image

Pushes to `main` publish `ghcr.io/mindreon/orbit-web` (`main`, `latest`, short SHA)
with same-origin `/v1` baked in for the Caddy edge. `orbit-infra` pulls it by
configurable `ORBIT_IMAGE_TAG`.

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

Authentication and any Temporal, agent-runtime, or LLM SDK in the browser. Persona,
Skill, workspace, enterprise connector and artifact management remain explicit
future capabilities; Cloud Agent jobs stay a grey card until W2.
