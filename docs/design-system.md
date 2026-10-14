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

`max-w-reading` is `40em`; put it on an element whose font-size is `text-body` and a line holds about 40 Chinese
characters. The conversation, the user bubbles, the artifact cards and the composer share that column.

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
