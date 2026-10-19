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

- Sidebar 240px, `bg-gray-50`, no right border; the main area is `bg-background`. Items are 32px rows,
  `rounded-control`, `text-body`; the active item is `bg-gray-200 font-medium`, hover `bg-gray-100`.
- Order: workspace switcher (one row, chevron; the tenant is never shown in the UI) → primary "新建会话" button (full width, the only
  primary fill in the sidebar) → 最近会话 (section label, max 12 rows, single-line truncated titles, a 6px status dot
  on the right: primary-500 运行中, warning-500 等待你处理, none when idle) → navigation → "我" pinned to the bottom.
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
  (`text-caption text-muted-foreground`: status · 耗时 · 成本 · 查看运行) with no rule line.
- User bubble: right-aligned, `bg-gray-100 rounded-bubble px-4 py-2.5`, max 80% width. Assistant message: no bubble,
  full column width, Markdown at `text-body leading-7`. Streaming cursor: 2px × 1em primary-500 bar blinking 1s.
  Reasoning: a collapsed `text-small text-muted-foreground` row "思考过程" with chevron; expanded body in gray-600.
- Tool card: `bg-gray-50 rounded-card`, 40px collapsed row, no icon: tool name in mono `text-small`, effect
  chip (read: gray, write: warning, external_write: danger tinted 50/700), state at the right (spinner while running,
  success-500 check, danger-700 "失败"). Expand shows 参数 / 结果 as two labelled mono blocks, 12 lines max with
  "展开全部". Collapsed by default when finished; failures stay expanded.
- Team message: indented 16px, `text-small`, "成员A → 成员B" in gray-500, body collapsed to one line.
- Composer: `rounded-bubble bg-card` with a 1px gray-200 border (the one bordered surface on the page), 1–8 lines
  auto-grow, send button is a 32px round primary icon button inside the field at bottom-right; while a run is active
  it becomes a square "停止" (gray-900 fill), with 暂停/继续 as a text button beside it. Disposition notes appear as one
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
