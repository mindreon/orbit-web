# Architecture

orbit-web is the Orbit browser shell. It is a **consumer** of orbit-control. It is not an orchestrator, model host, workflow worker, or agent-runtime frontend.

## Product surfaces

| Nav | Product | Later behavior (still via control only) |
| --- | --- | --- |
| **Rooms** | Super single-agent (`solo`) and multi-agent (`collab`) | Chat, steer, abort, subagent catalog, live WS |
| **Approvals** | HITL | Decide allow/reject; unread badge from pending count |
| **Agents** | Personas + **Cloud Agent** jobs | Persona CRUD; Cloud Job cards become runnable in W2 |
| **Settings** | Secrets metadata, account | Never plaintext secrets; no runtime credential UI |

The browser never loads the worker. It only shows the runtime snapshot control returns.

W1 Rooms show that snapshot (`kernel`, `protocol`, `isolation`) and a permission
preset. The live worker identity is `agentscope`; `protocol` may be empty.
The UI sends the selected preset to control and does not configure the worker
itself.

## Boundary

```
[ browser: orbit-web ]
        |  HTTP / WS  (control OpenAPI only)
        v
[ orbit-control ]
        |  (server-side only)
        +--> Temporal (orbit-orch)
        +--> worker grants + event ingest
             (worker hosts AgentScope)
```

**Allowed from the browser:** orbit-control endpoints published in control's OpenAPI spec.

**Forbidden from the browser (and from this repo's client bundle):**

- Temporal client / worker / task-queue APIs
- Direct LLM or model-provider SDKs
- Agent runtime web / SDK / worker sockets
- Ad-hoc URLs that skip control
- Secrets that belong on the control side

W1 performs live Room, approval, steer, activity-history and SSE calls through
control only. The rule prevents later waves from growing a second backend from
the UI.

## OpenAPI consumer

Control **owns** the contract. Web **consumes** it.

| Role | Repo | Artifact |
| --- | --- | --- |
| Provider | [mindreon/orbit-control](https://github.com/mindreon/orbit-control) | `docs/openapi.yaml` (control-owned) |
| Consumer | this repo | [`openapi/consumer.yaml`](./openapi/consumer.yaml) |

The hand-written W1 client consumes only paths declared in that spec. A later
wave should generate the types; until then contract changes must update
control's OpenAPI first.

When a later wave needs types, generate them from the control spec. Do not invent parallel request shapes in the UI.

## App shape (W1)

- Next.js App Router shell
- Four locked destinations: Agents, Rooms, Approvals, Settings
- Default route: Rooms (`/` → `/rooms`)
- Rooms creates `solo|collab` tasks with a pinned permission preset, sends
  turns, steers, aborts and renders a normalized execution timeline
- Approvals lists live HITL records and decides allow-once or reject
- Agents keeps **Cloud** as its own type (Cloud Job card), not mixed into persona cards

Information architecture: [`docs/ia-w0.md`](./docs/ia-w0.md).

## Auth

None in W1. This is not a production authorization boundary.

## What lands in later waves

Chat send, live rooms, collab agent pane, HITL actions, Cloud Job (`W2`), settings persistence, and a generated control client. Those features still enter the browser only through orbit-control.
