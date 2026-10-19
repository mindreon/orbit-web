# Orbit web design system

One source of truth: the variables at the top of `src/index.css` (with the comment block that summarises them) and
`tailwind.config.ts`. This page is the short version.

## Color

- `gray-50 … gray-900`: ten steps. 50 is the quietest surface, 900 the strongest text. In the dark theme the values flip
  (50 darkest, 900 lightest) so the same class works in both themes.
- `primary`, `success`, `warning`, `danger`: steps `50, 100, 200, 500, 600, 700`.
  `50/100` tinted surface, `200` soft edge, `500` icon or dot, `600` solid fill (white text), `700` text.
  `700` on `50`/`100` and on the plain card is at least 4.5:1 in both themes; the primary button label on `--primary`
  is at least 4.5:1 (`src/lib/contrast.test.ts` reads the stylesheet and checks it).
- Semantic tokens (`bg-background`, `bg-card`, `bg-muted`, `text-muted-foreground`, `bg-primary`, `border-border`, …)
  alias ramp steps and keep working. `--primary-hover` is the darker fill under a hovered primary button.
- Never build a shade with opacity (`bg-primary/10`, `text-foreground/80`). Use the step (`bg-primary-100`, `text-gray-700`).
  Semantic text uses the 700 step (`text-danger-700`), not the bare colour.
  Overlays (`bg-black/40`) are not semantic colours and are fine.

## Type

Exactly six sizes, rem based (so the font-size preference scales them):

| class | px | use |
| --- | --- | --- |
| `text-caption` | 12 | badges, timestamps, helper text |
| `text-small` | 13 | section labels, secondary lines |
| `text-body` | 14 | everything that is read |
| `text-title` | 16 | page and dialog titles |
| `text-heading` | 20 | large headings (phones) |
| `text-display` | 24 | the home heading (desktop) |

Weights: `font-normal` 400, `font-medium` 500, `font-semibold` 600.
Section label: `text-small font-medium text-muted-foreground`. Card title: `text-body font-semibold text-foreground`.
Rows that mix sizes (title and badge, title and "编辑") use `items-baseline`, not `items-center`.

## Shape and space

- Radius: `rounded-control` 8px (buttons, fields, chips, rows), `rounded-card` 12px (cards, panels, popovers),
  `rounded-bubble` 20px (the user's message bubble and the composer, nothing else), `rounded-full`.
- Spacing is Tailwind's 4px grid.
- Separate with spacing and background difference (white card on a gray page) before reaching for a border.
  Borders stay on form controls, outline buttons, popovers, and the one rule under a table header or the task header.

## Attention

Use tinted 50 surfaces and 700 text for messages (`src/ui/Alert.tsx`). Reserve stronger visual accents for
an action the person must take. WP9 will add interaction cards with their workflows; WP4 keeps only used primitives.

## Reading width

`max-w-reading` is `48rem` (768px); at `text-body` a line holds about 54 Chinese characters. The conversation, the user bubbles, the artifact cards and the composer share that column.

## Responsive

- `< 640px`: the sidebar becomes a drawer opened from the top bar.
- Page padding is `px-4 sm:px-6`; headings step down on phones (`text-heading sm:text-display`).

## Display language

Use Chinese labels in pages and keep protocol identifiers out of user-facing copy. WP4 has login, callback and
profile pages; feature-specific wording belongs with the WP9 feature that introduces it.

## Markdown and file previews

`src/components/markdown/Markdown.tsx` treats raw HTML as literal text and applies DOMPurify plus rehype-sanitize.
External images load only after the reader opts in. Closed Mermaid blocks render in strict mode and their SVG is
purified again; incomplete or invalid diagrams show source. Code blocks preserve their state during streaming.

`src/components/files/preview/registry.ts` selects one of ten lazy previewers: SVG, image, Markdown, HTML, PDF,
DOCX, sheet, PPTX, code and text. HTML uses a sandboxed iframe; SVG uses image mode. Office previews show an
approximation notice and keep download available. Unknown formats and large files offer download instead of parsing.

## Page patterns (WP9)

The lead owns the look of every WP9 page. Workers build to these patterns; the lead reviews real screenshots
(desktop 1440 and phone 390, light and dark) and polishes the visual layer before a sub-package is committed.

### Overall tone

Calm, dense enough for daily work, never decorative. One accent (primary) for the single next action on a screen;
everything else is gray steps. No gradients, no shadows beyond the popover/dialog elevation, no illustrations,
no emoji in UI copy. Motion: 150ms ease-out for open/close and hover; nothing animates on its own except the
streaming cursor and the live-status dot.

### Shell

- Sidebar 240px, `bg-gray-50` with a `border-border` right edge (it separates the sidebar from the content in both themes); the main area is `bg-background`. Items are 32px rows,
  `rounded-control`, `text-body`; the active item is `bg-gray-200 font-medium`, hover `bg-gray-100`.
- Order: brand row (24px primary monogram + "Orbit") → workspace switcher (one row, chevron; the tenant is never shown in the
  UI) → primary "新建会话" button (full width, the only primary fill in the sidebar) → navigation in three groups (unlabelled
  main group, then "资源" and "系统" with `text-small font-medium text-muted-foreground` labels, 16px between groups) →
  最近会话 (section label, max 12 rows, single-line truncated titles, a 6px status dot on the right: primary-500 运行中,
  warning-500 等待你处理, none when idle) → "我" pinned to the bottom above a hairline.
- Page header: `text-title font-semibold`, optional `text-small text-muted-foreground` subline, actions right-aligned
  and baseline-aligned. 24px top padding, 16px under the header. No breadcrumb.

### Catalog (专家 / 专家团)

- Responsive grid of cards: 1 column < 640, 2 ≥ 640, 3 ≥ 1024; 12px gap. Card `bg-card rounded-card p-4`, no border
  on the gray page; hover lifts to `bg-gray-50` background change only.
- Inside: line 1 title (`display_name` or `name`) `text-body font-semibold` + "已安装" chip (`bg-success-50
  text-success-700 text-caption rounded-control px-1.5`) on the baseline; line 2 description, 2 lines clamped,
  `text-small text-muted-foreground` (empty line kept so cards align); line 3 `publisher/name` in mono `text-caption
  text-gray-500` left, "开始对话" outline button (small) right. A search field (240px) sits in the page header.

### Session page

- Three zones: timeline column (`max-w-reading`, centered in the free space), composer pinned to the bottom of that
  column, file area as a 320px right panel ≥ 1280 (toggle button in the header), drawer below.
- Header: one row, 48px, title (inline edit on click, same size), then `text-small text-muted-foreground`
  "专家 · 名称", then right side: stream status (dot + word only when not live), message-policy select, "…" menu
  with 归档. A hairline under the header only after the timeline scrolls.
- Rhythm: 24px between turns, 8px between items within one assistant turn. A run divider is a quiet centered row
  (`text-caption text-muted-foreground`: status · 耗时 · 成本 · 查看运行) between two `bg-border` hairlines that fill
  the reading column, so each run reads as closed.
- User bubble: right-aligned, `bg-gray-100 rounded-bubble px-4 py-2.5`, max 80% width. Assistant message: no bubble,
  full column width, Markdown at `text-body leading-7`. Streaming cursor: 2px × 1em primary-500 bar blinking 1s.
  Reasoning: a collapsed `text-small text-muted-foreground` row "思考过程" with chevron; expanded body in gray-600.
- Tool card: `bg-gray-50 rounded-card`, 40px collapsed row, no icon: tool name in mono `text-small`, effect
  chip (read: gray, write: warning, external_write: danger tinted 50/700), state at the right (spinner while running,
  success-500 check, danger-700 "失败"). Expand shows 参数 / 结果 as two labelled mono blocks, 12 lines max with
  "展开全部". Collapsed by default when finished; failures stay expanded.
- Team message: indented 16px, `text-small`, "成员A → 成员B" in gray-500, body collapsed to one line.
- Composer: `rounded-bubble bg-card` with a 1px gray-200 border (the one bordered surface on the page), 1–8 lines
  auto-grow, send button is a 32px round primary icon button inside the field at bottom-right whenever text is non-empty; while a run is active (including paused), only an empty field replaces it with a square "停止" (gray-900 fill), and 暂停/继续 remains available beside either button. Disposition notes appear as one
  `text-caption` line above the field and fade after 4s.
- Pending banner (waiting_input / waiting_approval): a warning-50 strip directly above the composer, one line
  summary + "跳到卡片".

### Interaction cards (approval / ask / effect)

These are the only cards that may use a coloured edge: 3px left bar warning-500 while pending, gray-300 once handled.
`bg-card rounded-card p-4`, shadow none. Title row: kind label `text-small font-semibold` + expiry
`text-caption text-muted-foreground` on the right. Calls listed as compact rows (tool mono, effect chip,
risk reasons as `text-small text-warning-700` bullets). Buttons on one row, wrapping on phones:
"允许一次" primary, "本会话允许" outline, "始终允许…" ghost (expands inline, not a dialog), "拒绝" ghost danger-700 at the
far right. Handled state collapses to one line: check icon + "已由 你 于 14:02 处理：允许一次". On phones buttons go
full width, stacked, primary first, 44px tall.

### Inbox

A single list of the same cards, 12px apart, `max-w-reading`, each with a top line "会话 · 成员" link in
`text-small`. Empty state: centered `text-body text-muted-foreground` "没有待你处理的事项", no illustration.

### Run replay (`/runs/:runId`, WP9d)

- One reading page, not a dashboard: `max-w-5xl` centred, sections stacked with 32px between them. Each section has a
  `text-title font-semibold` heading with an optional caption count (`text-caption text-muted-foreground`, e.g. "3 段").
- Header: back link "← 返回会话" (`text-small`), then the run title row: status badge + `font-mono text-small` run id
  (truncated, copy on click) on the left, actions (停止 / 暂停 / 继续, by state) right-aligned. Under it a facts row:
  `dl` as a wrapping grid of label/value pairs (`text-caption` label in muted, `text-body` value; 触发方式, 开始, 结束, 时长,
  预算 已用/上限, 成本). An error code shows as a danger `Alert` under the facts, never inside the grid.
- Status badge (shared by runs, segments, effects, tasks, members): `rounded-control px-1.5 text-caption`, tinted by
  meaning only: running/working → primary-50/700, waiting_* → warning-50/700, succeeded/completed → success-50/700,
  failed/timed_out/budget_exhausted → danger-50/700, cancelled/idle/queued/paused → gray-100/700. Text is always the
  Chinese label; colour is never the only signal.
- Tables (segments, effects, cost): no outer border, `bg-card rounded-card` container, header row `text-caption
  text-muted-foreground font-medium`, rows 40px `text-small` separated by `border-border` hairlines, numbers
  right-aligned with `tabular-nums`, protocol values (tool names, error codes, checkpoint versions, quantities) in
  `font-mono`. On phones a table scrolls horizontally inside its card; the page itself never overflows.
- Timeline: reuses the session timeline read-only in the left reading column. For team runs a member filter sits above
  it as a segmented row of chips (全部 + each member; active chip `bg-gray-200 font-medium`).
- Interactions list: one row per record — kind, request summary (mono, one line, truncated), status badge, decision,
  by whom, when. Empty → one muted sentence ("没有审批记录").
- Ops (platform operators only): a collapsed `details` at the very bottom, "运维信息", mono key/value rows with external
  links (Temporal, trace) opening in a new tab.

### TeamBoard (`features/teams`)

- Members strip first: one compact card per member (`bg-card rounded-card p-3`, min 180px, wraps): name (`font-medium`),
  role label (负责人 / 成员 / 评审) in muted caption, status badge, current task title (one line, truncated). A member
  that is `working` gets a 6px primary dot before its name, pulsing only if `prefers-reduced-motion` allows.
- Task columns under it, one per contract `TaskStatus` in contract order, each a `bg-muted rounded-card p-2` lane with
  a caption header "状态 · n". Task cards inside are `bg-card rounded-control p-3`: title (`text-small font-medium`, two
  lines max), assignee chip, dependency count ("依赖 2"), attempt count when > 1, review verdict as a status badge.
  Lanes form a wrapping grid (3 columns ≥1024px, 2 ≥640px, 1 on phones), top-aligned so an empty lane is just its
  header; no horizontal scrolling, every lane stays visible.
- On `finished` the summary appears above the members strip as a quiet panel (`bg-success-50 rounded-card p-4`,
  Markdown body), titled "总结".
- In the session page the board sits in a collapsible panel above the timeline of a team run (open while the run is
  active, collapsed once it ends); on the replay page it is a full section.

### Schedules (`/schedules`, WP9e)

- List page: header "定时任务" with a primary "新建定时任务" on the right. Rows, not cards: one `bg-card rounded-card`
  container, 56px rows separated by hairlines. Each row: name (`text-body font-medium`) with the entry under it
  (kind label · mono ref, `text-caption text-muted-foreground`); the cron's human reading in `text-small` with the raw
  cron + timezone in mono caption under it; status badge (启用 / 已暂停, plus a muted "同步中" chip); next fire time
  right-aligned `tabular-nums`. The whole row links to the detail. Phone: the cron and next-fire columns fold under
  the name; nothing scrolls sideways.
- Form (`/schedules/new`, edit): a single column `max-w-reading`, grouped into three quiet blocks with
  `text-small font-medium text-muted-foreground` group labels: 基本 (名称, 描述), 运行 (入口, 提示词 textarea 6 rows),
  时间 (cron with its live human reading and the next three fire times under it as mono captions; 时区 select;
  重叠策略; 补跑窗口), 预算 (积分 input showing the millicredit value as a caption). Field errors sit directly under
  the field in danger-700 `text-small`; the first failing field gets focus. Footer: 取消 (ghost) and the primary
  submit, right-aligned, sticky at the bottom of the viewport on phones.
- Detail: header with name, status badge and actions (立即运行 primary; 暂停/恢复; 编辑; 删除 behind a confirm
  dialog in danger). Then a facts grid like the run replay header (入口, cron reading, 时区, 下次触发, 预算, 重叠策略,
  补跑窗口), the prompt in a `bg-muted rounded-card` block, and 最近运行 as a table (触发时间, 状态 badge, 耗时,
  错误码, link 查看运行 → `/runs/:id`, session link).

### Admin (`/admin/*`, WP9e)

- The admin area has its own secondary navigation: a horizontal tab row under the page header on all widths
  (工作空间 · 成员 · API Key · 服务账号 · 模型 · 密钥 · 额度 · 审计), scrollable on phones; the active tab is
  `font-medium` with a 2px primary underline. Only tabs the user may see are rendered. The sidebar keeps one
  "管理" and one "审计" entry that land on these tabs.
- Every admin list is the same table pattern as the run replay tables. Row actions are a trailing ghost icon
  button opening a dropdown (改角色, 停用/恢复, 吊销, 删除); destructive items are danger and go through a confirm
  dialog that names the object.
- Read-only pages (模型, 密钥, 额度) start with a one-line `bg-muted rounded-control px-3 py-2 text-small` note
  "只读。修改请使用 `orbit-admin`。" Secret values never appear; the 密钥 table has no value column at all.
- A one-time secret (new API key) shows in a dialog: the key in a mono `bg-muted` box with a copy button, a
  warning-tinted line "关闭后无法再次查看", and a single primary "我已保存" button that closes it.
- 用量 (`/usage`): filters in one wrapping row (范围, 时间段, 粒度, 分组). Results table where the last column
  carries a CSS bar (`bg-primary-100` track-less bar proportional to the max row, 6px high, under the number).
  `computed_through` as a muted caption above the table; `dirty_hours>0` adds a warning caption.

### States

Skeletons mirror the final layout (same heights), gray-100 blocks, no shimmer. Errors use `Alert` inline at the
place of the failed content, never a full-page takeover except 404. Empty states are one sentence plus at most
one action.

## Lint

`eslint-rules/design-tokens.js` (rule `orbit/design-tokens`) fails on arbitrary font sizes, retired Tailwind sizes,
opacity-built semantic colours, bare semantic text colours, weights outside 400/500/600 and off-scale radii (`rounded-bubble` is on the scale).
A legitimate exception takes `// eslint-disable-next-line orbit/design-tokens -- reason`.

## Checks

- `pnpm lint`: enforces the design token rules in all application components.
- `pnpm test`: includes stylesheet contrast and lint-rule checks, Markdown XSS/rendering regressions,
  every previewer's lazy rendering, and auth component states under jsdom.
- `pnpm licenses:check`: verifies the root NOTICE against the direct runtime dependencies in package.json and
  their installed license metadata/text. `pnpm licenses:write` regenerates it for review after a dependency change.
- `pnpm typecheck` and `pnpm build`: check all TypeScript components and the production bundle.

The Markdown and preview tests use real sanitizers and renderers. Mermaid output and PDF/Office SDK boundaries
are controlled fixtures because jsdom has no canvas, workers or Office layout engine; these tests verify the component
integration and fallback paths. WP9 adds browser layout and full application journeys against the development stack.
