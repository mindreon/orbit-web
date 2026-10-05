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

- Radius: `rounded-control` 8px (buttons, fields, chips, rows), `rounded-card` 12px (cards, panels, popovers), `rounded-full`.
- Spacing is Tailwind's 4px grid.
- Separate with spacing and background difference (white card on a gray page) before reaching for a border.
  Borders stay on form controls, outline buttons, popovers, and the one rule under a table header or the task header.

## Attention

Anything that needs a person (approval waiting, blocked review, takeover, exhausted budget, rejected follow-up,
a question from the agent) is an `<Attention>` card (`src/ui/Attention.tsx`): tinted 50 surface, left accent bar, shadow.
Everything else stays flat and grey so the card is the loudest thing in its view. `<Alert>` is for passive messages.

## Reading width

`max-w-reading` is `40em`; put it on an element whose font-size is `text-body` and a line holds about 40 Chinese
characters. The conversation, the user bubbles, the artifact cards and the composer share that column.

## Responsive

- `< 1024px`: the task details become a slide-over drawer opened from the task header.
- `< 640px`: the sidebar becomes a drawer opened from the top bar.
- Page padding is `px-4 sm:px-6`; headings step down on phones (`text-heading sm:text-display`).

## Display language

Internal wording becomes user wording in one place, `src/lib/display.ts` (profile refs → expert names, plan node
titles and types, catalogue and framework labels, frontmatter stripping). Add a mapping there, not in a component.

Teams follow the same rule: a role id (`researcher`) becomes 「研究员」, the leader is 「领队」 whatever its role was named,
and a review reads 「领队复盘 · 第 N 轮」 — all in `display.ts` (`roleLabel`, `memberRoleText`, `nodeRoles`, `roleText`).
A task with a team is a group chat (`src/lib/chat.ts`, `GroupChat`): one header per run of one speaker's bubbles, the avatar
at the group's bottom-left, @mentions as chips coloured by the member's place in the team, a notice from the runtime as a
quiet centred line, the member's steps folded under its bubble. A plan node as 「<角色> · <专家名>」; a member's approval is
「成员 <显示名> 请求确认」; the review cap is an `<Attention>` card with the same 「继续」 as any other wait for a person.

## Lint

`eslint-rules/design-tokens.js` (rule `orbit/design-tokens`) fails on arbitrary font sizes, retired Tailwind sizes,
opacity-built semantic colours, bare semantic text colours, weights outside 400/500/600 and off-scale radii.
A legitimate exception takes `// eslint-disable-next-line orbit/design-tokens -- reason`.

## Checks

- `pnpm test`: contrast, display mapping, usage, and the lint rule itself.
- `pnpm exec playwright test e2e/design.spec.ts`: pages at 1440×900 and 390×844 with a mocked API; no sideways scroll,
  only the six font sizes, conversation column width, drawers, sidebar spacing, and the team surfaces (team card, editor,
  member labels, grouped plan, team stage, review cap). Screenshots go to
  `e2e-artifacts/design/` (git-ignored).
