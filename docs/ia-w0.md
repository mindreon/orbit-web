# Orbit Web — W0 Information Architecture

Status: wireframe only. Gate A nav locked. No visual tokens until after Gate A design-review sign-off.

## Global nav (4)
- Agents | Rooms | Approvals | Settings
- Default landing: Rooms
- Approvals: unread badge when pending count > 0

## Agents
- Grid of persona cards (placeholder)
- Separate section: Cloud Job cards — gray, label「Cloud Job」, badge「W2」, not clickable / not runnable in W0–W1
- Do not mix Cloud cards into Rooms

## Rooms (default)
- Left: room list (1:1 / group)
- Main: chat canvas; empty state「选择或创建一个房间」
- Composer present as shell only (no live send until W1)

## Approvals
- Queue of cards: pending / decided
- Card shows tool/action summary + Approve / Reject (disabled stubs OK in W0)
- HITL is Temporal-backed; UI only surfaces approvals from control API

## Settings
- Secrets area: placeholder list; never show plaintext secrets
- Empty:「暂无密钥」
- Profile/account minimal placeholder OK

## Out of scope W0
- Cloud agent run UI (W1.5/W2)
- Token/theme polish
- Fake demo data for balances/secrets
