# W0 information architecture

Wireframe-level IA only. Aura-aligned **structure** (regions, hierarchy, type separation). No design tokens, type ramp, or color system in this wave.

Nav is locked. Do not add destinations.

## Locked destinations

| Order | Destination | Route | Default | W0 surface |
| --- | --- | --- | --- | --- |
| 1 | Agents | `/agents` | | Persona region (empty) + separate Cloud type card |
| 2 | Rooms | `/rooms` | yes | Empty main; no composer / send |
| 3 | Approvals | `/approvals` | | Empty list stub; unread badge placeholder on nav |
| 4 | Settings | `/settings` | | Empty stub |

`/` redirects to `/rooms`.

## Aura alignment (IA only)

- Persistent **left rail** for the four primary destinations (not a hamburger-first desktop chrome).
- One **primary work surface** to the right of the rail. No secondary inspector in W0.
- **Settings** is a destination at the bottom of the rail, not a modal.
- **Approvals** is an inbox: a badge can sit on the nav item. The badge is a placeholder, not a count.
- Catalogs keep **types apart**. Persona cards and Cloud Job are different types; they never share a card grid.
- Empty states are first-class. Do not invent business rows to fill the layout.
- No token sheet (spacing, color, type) in W0.

## Global chrome

```
+------------------+----------------------------------------------+
| Orbit            |  {section title}                             |
|                  |----------------------------------------------|
| Agents           |                                              |
| Rooms          * |  primary work surface                        |
| Approvals     ( )|                                              |
| Settings         |                                              |
+------------------+----------------------------------------------+
```

- `*` = default destination (Rooms).
- `( )` = unread badge placeholder on Approvals (static; not wired).
- Rail labels are the four words above. No extra nav items, overflow menus, or user/account chrome in W0.

## Agents

Two **sibling regions**, stacked. Cloud is a type, not a persona.

```
+------------------+----------------------------------------------+
| Agents           |  Agents                                      |
| Rooms            |                                              |
| Approvals     ( )|  Personas                                    |
| Settings         |  +----------------------------------------+  |
|                  |  |  empty  (no persona cards in W0)       |  |
|                  |  +----------------------------------------+  |
|                  |                                              |
|                  |  Cloud                                       |
|                  |  +----------------------------------------+  |
|                  |  |  Cloud Job                      「W2」 |  |
|                  |  |  grey / disabled / not clickable       |  |
|                  |  +----------------------------------------+  |
+------------------+----------------------------------------------+
```

Rules:

- Label on the Cloud type card: **Cloud Job**.
- Wave mark: **「W2」** (disabled affordance, not a control).
- Card is grey, disabled, and **not a link or button**.
- Do not place the Cloud card in the persona region or in a mixed “all agents” grid.

## Rooms (default)

```
+------------------+----------------------------------------------+
| Agents           |  Rooms                                       |
| Rooms          * |                                              |
| Approvals     ( )|  empty main                                  |
| Settings         |  (no room list data, no thread, no send)     |
+------------------+----------------------------------------------+
```

No composer, send button, attachment control, or message list. Chat is out of W0.

## Approvals

```
+------------------+----------------------------------------------+
| Agents           |  Approvals                                   |
| Rooms            |                                              |
| Approvals     ( )|  empty list stub                             |
| Settings         |  (no HITL cards, approve/reject, or detail)  |
+------------------+----------------------------------------------+
```

HITL UI beyond this empty list is out of W0. The nav badge is the only unread signal, and it is fake.

## Settings

```
+------------------+----------------------------------------------+
| Agents           |  Settings                                    |
| Rooms            |                                              |
| Approvals     ( )|  empty stub                                  |
| Settings         |  (no preference groups or persisted fields)  |
+------------------+----------------------------------------------+
```

## Non-goals

- Real chat (1:1 / group) or send
- HITL cards, approve / reject, or approval detail
- Auth, account switcher, or org switcher
- Design tokens, theming, or visual polish
- Mixing Cloud Job into persona cards
- Extra nav items
