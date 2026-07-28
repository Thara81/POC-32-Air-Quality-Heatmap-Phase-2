import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "rail-void": "#0A0D10",
        "rail-panel": "#12171C",
        "rail-panel-raised": "#161D23",
        "rail-line": "#232B31",
        "rail-line-bright": "#33414A",
        "text-primary": "#E8EDF0",
        "text-muted": "#7C8994",
        "text-faint": "#4B565F",
        "signal-clear": "#3FE0C5",
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
