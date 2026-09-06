import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "rail-void": "#07110F",
        "rail-panel": "#0D1B19",
        "rail-panel-raised": "#112522",
        "rail-line": "#1D3833",
        "rail-line-bright": "#31564E",
        "text-primary": "#E8EDF0",
        "text-muted": "#7C8994",
        "text-faint": "#4B565F",
        "signal-clear": "#67DABE",
        "signal-good": "#7ED957",
        "signal-warn": "#F5A623",
        "signal-alert": "#E85D4C",
        "signal-severe": "#B23A5C",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "rail-track": "repeating-linear-gradient(90deg, transparent, transparent 6px, #232B31 6px, #232B31 8px)",
      },
    },
  },
  plugins: [],
};
export default config;
