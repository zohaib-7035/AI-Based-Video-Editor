import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "studio-bg":             "#121212",
        "studio-surface":        "#1E1E1E",
        "studio-surface-hover":  "#262626",
        "studio-text":           "#E0E0E0",
        "studio-muted":          "#D3D3D3",
        "studio-accent":         "#6082B6",
        "studio-accent-hover":   "#6e94cc",
        "studio-neutral":        "#708090",
        "studio-neutral-hover":  "#7f909f",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
        mono: ['"JetBrains Mono"', '"SF Mono"', "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
