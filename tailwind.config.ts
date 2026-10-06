import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

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
      /** The user's message bubble (and the composer, which reuses it): 20px. Only these two surfaces round this far. */
      bubble: "1.25rem",
      full: "9999px",
    },
    extend: {
      keyframes: {
        /** The sweep of `.shimmer-text`: a lighter band moves left to right through the letters of a running activity. */
        shimmer: { "0%": { backgroundPosition: "100% 0" }, "100%": { backgroundPosition: "-100% 0" } },
      },
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
  plugins: [
    // Text of something that is running (正在读取 foo.ts, 正在思考): the letters carry a moving highlight. The gradient is built from
    // ramp steps, so it flips with the theme. With reduced motion it is a plain muted line.
    plugin(({ addBase, addUtilities, theme }) => {
      // Emitted here rather than through an `animate-*` class: nothing in the markup uses one, so Tailwind would drop the keyframe.
      addBase({ "@keyframes shimmer": theme("keyframes.shimmer") });
      addUtilities({
        ".shimmer-text": {
          backgroundImage: "linear-gradient(90deg, hsl(var(--gray-500)) 0%, hsl(var(--gray-500)) 35%, hsl(var(--gray-900)) 50%, hsl(var(--gray-500)) 65%, hsl(var(--gray-500)) 100%)",
          backgroundSize: "200% 100%",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          color: "transparent",
          animation: "shimmer 2.4s linear infinite",
          "@media (prefers-reduced-motion: reduce)": {
            animation: "none",
            backgroundImage: "none",
            color: "hsl(var(--gray-500))",
          },
        },
      });
    }),
  ],
};

export default config;
