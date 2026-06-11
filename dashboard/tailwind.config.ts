import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Theme-dependent tokens resolve to CSS variables (space-separated RGB
        // channels) so the same utility classes work in both dark and light
        // mode and still support Tailwind's /opacity modifiers.
        bg: {
          DEFAULT: "rgb(var(--c-bg) / <alpha-value>)",
          elev: "rgb(var(--c-bg-elev) / <alpha-value>)",
          card: "rgb(var(--c-bg-card) / <alpha-value>)",
          hover: "rgb(var(--c-bg-hover) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--c-line) / <alpha-value>)",
          strong: "rgb(var(--c-line-strong) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
          dim: "rgb(var(--c-ink-dim) / <alpha-value>)",
          fade: "rgb(var(--c-ink-fade) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "#7c5cff",
          glow: "#a78bfa",
        },
        pos: {
          DEFAULT: "#22c55e",
          soft: "#16a34a33",
        },
        neg: {
          DEFAULT: "#ef4444",
          soft: "#dc262633",
        },
        warn: {
          DEFAULT: "#f59e0b",
          soft: "#d9770633",
        },
        cyan: {
          DEFAULT: "#22d3ee",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 12px 40px -14px rgba(0,0,0,0.75), 0 2px 8px -4px rgba(0,0,0,0.5)",
        "card-hover":
          "0 1px 0 0 rgba(255,255,255,0.07) inset, 0 18px 50px -16px rgba(0,0,0,0.8), 0 0 0 1px rgba(124,92,255,0.10)",
        glow: "0 0 24px -4px rgba(124,92,255,0.45)",
        "glow-cyan": "0 0 24px -4px rgba(34,211,238,0.40)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at 20% 0%, rgba(124,92,255,0.10), transparent 50%), radial-gradient(circle at 80% 100%, rgba(34,211,238,0.08), transparent 50%)",
        "card-sheen":
          "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 22%)",
      },
    },
  },
  plugins: [],
};

export default config;
