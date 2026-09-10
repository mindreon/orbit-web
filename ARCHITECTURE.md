# Architecture

orbit-web is the Orbit browser shell. It is a **consumer** of orbit-control. It is not an orchestrator, model host, workflow worker, or dsh frontend.

## Product surfaces

| Nav | Product | Later behavior (still via control only) |
| --- | --- | --- |
| **Rooms** | Super single-agent (`solo`) and multi-agent (`collab`) | Chat, steer, abort, subagent catalog, live WS |
| **Approvals** | HITL | Decide allow/reject; unread badge from pending count |
| **Agents** | Personas + **Cloud Agent** jobs | Persona CRUD; Cloud Job cards become runnable in W2 |
| **Settings** | Secrets metadata, account | Never plaintext secrets; no dsh credential UI |

dsh's own `web` profile is not used. The browser never loads a dsh origin.

## Boundary

```
[ browser: orbit-web ]
        |  HTTP / WS  (control OpenAPI only)
        v
[ orbit-control ]
        |  (server-side only)
        +--> Temporal (orbit-orch)
        +--> worker grants + event ingest
             (worker hosts dsh --profile acp)
```

**Allowed from the browser:** orbit-control endpoints published in control's OpenAPI spec.

**Forbidden from the browser (and from this repo's client bundle):**

- Temporal client / worker / task-queue APIs
- Direct LLM or model-provider SDKs
- dsh web / SDK / ACP endpoints
- Ad-hoc URLs that skip control
- Secrets that belong on the control side

W0 does not perform those calls. The rule is documented now so later waves do not grow a second backend from the UI.

## OpenAPI consumer

Control **owns** the contract. Web **consumes** it.

| Role | Repo | Artifact |
| --- | --- | --- |
| Provider | [mindreon/orbit-control](https://github.com/mindreon/orbit-control) | `docs/openapi.yaml` (control-owned) |
| Consumer | this repo | [`openapi/consumer.yaml`](./openapi/consumer.yaml) |

W0 only **links** that spec (`openapi/consumer.yaml` and `src/lib/control-openapi.ts`). There is no generated client, no `fetch` to control, and no mock business payloads.

When a later wave needs types, generate them from the control spec. Do not invent parallel request shapes in the UI.

## App shape (W0)

- Next.js App Router shell
- Four locked destinations: Agents, Rooms, Approvals, Settings
- Default route: Rooms (`/` → `/rooms`)
- Empty page stubs only; Rooms has no composer / send
- Approvals is an empty list plus a nav unread-badge placeholder
- Agents keeps **Cloud** as its own type (Cloud Job card), not mixed into persona cards

Information architecture: [`docs/ia-w0.md`](./docs/ia-w0.md).

## Auth

None in W0.

## What lands in later waves

Chat send, live rooms, collab agent pane, HITL actions, Cloud Job (`W2`), settings persistence, and a generated control client. Those features still enter the browser only through orbit-control.
