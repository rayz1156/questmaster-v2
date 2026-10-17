import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Poppins", "system-ui", "sans-serif"],
        display: ["Sora", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      colors: {
        // Kuizen Academy primary (deepened emerald)
        academy: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857", // PRIMARY
          800: "#065f46",
          900: "#064e3b",
          950: "#022c22",
          DEFAULT: "#047857",
        },
        // Veltrix endorser — deep navy authority
        veltrix: {
          50: "#f0f4fa",
          100: "#dbe5f1",
          200: "#b7cbe3",
          300: "#8aa9cf",
          400: "#5b82b4",
          500: "#3d629a",
          600: "#2f4d7e",
          700: "#243d65",
          800: "#1b2d4b",
          900: "#0f1e35", // ENDORSER PRIMARY
          950: "#070f1c",
          DEFAULT: "#0f1e35",
        },
        // Accent gold (certification, achievement)
        gold: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706", // ACCENT PRIMARY
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
          DEFAULT: "#d97706",
        },
        // Legacy brand (kept for backwards compat with existing components)
        brand: {
          DEFAULT: "#047857",
          purple: "#047857", // legacy alias
          blue: "#0d9488",  // legacy alias
          50: "#ecfdf5",
          100: "#d1fae5",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
        },
        accent: {
          DEFAULT: "#14b8a6",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
        },
        // Semantic
        success: { DEFAULT: "#059669", soft: "#d1fae5" },
        warning: { DEFAULT: "#d97706", soft: "#fef3c7" },
        danger:  { DEFAULT: "#dc2626", soft: "#fee2e2" },
        info:    { DEFAULT: "#2563eb", soft: "#dbeafe" },
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #047857 0%, #059669 50%, #14b8a6 100%)",
        "academy-gradient":
          "linear-gradient(135deg, #0f1e35 0%, #243d65 45%, #047857 100%)",
        "hero-mesh":
          "radial-gradient(at 20% 10%, #04785722 0px, transparent 50%), radial-gradient(at 80% 30%, #0f1e3522 0px, transparent 50%), radial-gradient(at 60% 90%, #d9770622 0px, transparent 50%)",
      },
      boxShadow: {
        card: "0 4px 20px rgba(15, 30, 53, 0.06)",
        "card-hover": "0 8px 32px rgba(15, 30, 53, 0.10)",
        elevated: "0 12px 40px rgba(15, 30, 53, 0.12)",
        focus: "0 0 0 3px rgba(4, 120, 87, 0.20)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      fontSize: {
        "display-2xl": ["4.5rem", { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-xl":  ["3.5rem", { lineHeight: "1.08", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-lg":  ["2.5rem", { lineHeight: "1.15", letterSpacing: "-0.01em", fontWeight: "700" }],
        "display-md":  ["2rem",   { lineHeight: "1.2",  letterSpacing: "-0.01em", fontWeight: "600" }],
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};

export default config;
