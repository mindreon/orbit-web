import type { Config } from "tailwindcss";

/** A ramp is a set of CSS variables (`--gray-50`...) defined per theme in src/index.css. */
const ramp = (name: string, steps: readonly number[]) => Object.fromEntries(steps.map((step) => [step, `hsl(var(--${name}-${step}) / <alpha-value>)`]));
const STATUS_STEPS = [50, 100, 200, 500, 600, 700] as const;

// Design system: see the comment block at the top of src/index.css and docs/design-system.md.
// fontSize, fontWeight and borderRadius are replaced rather than extended: a leftover text-sm or rounded-xl
// would silently do nothing, so ESLint (eslint.config.js) also rejects the retired names.
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    fontSize: {
      caption: ["var(--text-caption)", { lineHeight: "1rem" }],
      small: ["var(--text-small)", { lineHeight: "1.25rem" }],
      body: ["var(--text-body)", { lineHeight: "1.375rem" }],
      title: ["var(--text-title)", { lineHeight: "1.5rem" }],
      heading: ["var(--text-heading)", { lineHeight: "1.75rem" }],
      display: ["var(--text-display)", { lineHeight: "2rem" }],
    },
    fontWeight: { normal: "400", medium: "500", semibold: "600" },
    borderRadius: {
      none: "0",
      control: "var(--radius-control)",
      card: "var(--radius-card)",
      full: "9999px",
    },
    extend: {
      maxWidth: {
        /** The conversation and composer column: 48rem (768px), about 54 CJK characters per line at text-body. */
        reading: "48rem",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          '"Noto Sans"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          "sans-serif",
        ],
      },
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        gray: ramp("gray", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        danger: ramp("danger", STATUS_STEPS),
        primary: {
          ...ramp("primary", STATUS_STEPS),
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          hover: "hsl(var(--primary-hover) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        success: { ...ramp("success", STATUS_STEPS), DEFAULT: "hsl(var(--success) / <alpha-value>)" },
        warning: { ...ramp("warning", STATUS_STEPS), DEFAULT: "hsl(var(--warning) / <alpha-value>)" },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          accent: "hsl(var(--sidebar-accent) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
