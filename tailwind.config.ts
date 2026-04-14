import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sidebar: { bg: "#0d1b2e", text: "#c8d8ec", muted: "#6a85a6", active: "#00c8f0" },
        accent: { DEFAULT: "#0091d4", light: "#00b4e8", cyan: "#00c8f0" },
        bg: { main: "#f0f4f9", card: "#ffffff", topbar: "#ffffff" },
        text: { primary: "#1a2540", secondary: "#556280", muted: "#9aaabf" },
        status: {
          okBg: "#e6f9f0", okText: "#1db868",
          errBg: "#ffeef0", errText: "#e03a4e",
          warnBg: "#fff8e6", warnText: "#f0a500",
        },
        kpi: { cost: "#e03a4e", revenue: "#1db868", profit: "#0091d4", views: "#1a2540" },
      },
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        num: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: { card: "12px" },
      boxShadow: { card: "0 2px 12px rgba(0,0,0,0.06)" },
    },
  },
  plugins: [],
};
export default config;
