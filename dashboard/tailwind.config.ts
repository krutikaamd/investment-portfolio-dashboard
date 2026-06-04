import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0a0f",
          elev: "#111118",
          card: "#15151f",
          hover: "#1c1c28",
        },
        line: {
          DEFAULT: "#23232f",
          strong: "#2e2e3d",
        },
        ink: {
          DEFAULT: "#e8e8ee",
          dim: "#b4b4c2",
          fade: "#8a8a9d",
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
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 32px -8px rgba(0,0,0,0.6)",
        glow: "0 0 24px -4px rgba(124,92,255,0.45)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at 20% 0%, rgba(124,92,255,0.10), transparent 50%), radial-gradient(circle at 80% 100%, rgba(34,211,238,0.08), transparent 50%)",
      },
    },
  },
  plugins: [],
};

export default config;
