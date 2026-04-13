import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-heebo)", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "#DD9933",
          light: "#E8B866",
          dark: "#C47F1A",
          50: "#FFF8ED",
          100: "#FFEFD4",
          200: "#FFDCA8",
          300: "#FFC371",
          400: "#E8B866",
          500: "#DD9933",
          600: "#C47F1A",
          700: "#DD9933",
          800: "#A06B15",
          900: "#7A5210",
        },
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
      },
    },
  },
  plugins: [],
};
export default config;
