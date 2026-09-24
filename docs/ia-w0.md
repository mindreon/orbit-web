# Orbit Web — W0 Information Architecture

Status: wireframe only. Gate A nav locked. No visual tokens until after Gate A design-review sign-off.

Target runtime (not in the browser): AgentScope on the worker, driven by control. The browser only reads the runtime snapshot control returns.

## Global nav (4)
- Agents | Rooms | Approvals | Settings
- Default landing: Rooms
- Approvals: unread badge when pending count > 0

## Agents
- Grid of persona cards (placeholder)
- Separate section: Cloud Job cards — gray, label「Cloud Job」, badge「W2」, not clickable / not runnable in W0–W1
- Do not mix Cloud cards into Rooms
- Do not mix Cloud cards into persona cards
- Later (W2): Cloud Job is a first-class runnable type (repo, prompt, state, HITL) — still its own section

## Rooms (default)
- Left: room list (1:1 / group). Later: badge `solo` vs `collab`
- Main: chat canvas; empty state「选择或创建一个房间」
- Composer present as shell only (no live send until W1)
- Later W1: live WS events (assistant / tools / approvals)
- Later W1.5 (`collab`): side pane for agent catalog (parent + children). Do not invent a fifth top-level nav item for teams

## Approvals
- Queue of cards: pending / decided
- Card shows tool/action summary + Approve / Reject (disabled stubs OK in W0)
- HITL is Temporal-backed; UI only surfaces approvals from control API
- Later: `allow` / `reject` call `POST /v1/approvals/{id}/decide`

## Settings
- Secrets area: placeholder list; never show plaintext secrets
- Empty:「暂无密钥」
- Profile/account minimal placeholder OK
- No runtime login / credential screens — control secrets metadata only

## Out of scope W0
- Cloud agent run UI (W1.5/W2)
- Collab agent pane (W1.5)
- Token/theme polish
- Fake demo data for balances/secrets
