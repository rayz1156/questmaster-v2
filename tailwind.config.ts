import type { Config } from "tailwindcss";

// Palet kelabu tema StafKita Akademi (dimetakan semula ke slate dan gray)
const slatePalette = {
  50: "#f5f6fa",
  100: "#ebeef2",
  200: "#dbdfea",
  300: "#c7cfdc",
  400: "#8094ae",
  500: "#6e82a5",
  600: "#526484",
  700: "#44556f",
  800: "#3c4d62",
  900: "#364a63",
  950: "#1c2b46",
};

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Fon tema: badan Roboto, tajuk Nunito (dimuat melalui next/font)
        sans: ["var(--font-roboto)", "Roboto", "system-ui", "sans-serif"],
        display: ["var(--font-nunito)", "Nunito", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      colors: {
        // Warna utama StafKita
        primary: {
          DEFAULT: "#6576ff",
          hover: "#5664d9",
          subtle: "#ebeeff",
        },
        // Kelabu (menggantikan palet slate/gray lalai)
        slate: { ...slatePalette },
        gray: { ...slatePalette },
        // Bar sisi gelap
        sidebar: {
          bg: "#101924",
          border: "#203247",
          text: "#6e82a5",
          heading: "#4f6178",
          active: "#6576ff",
        },
        // Warna status
        status: {
          success: "#1ee0ac",
          danger: "#e85347",
          warning: "#f4bd0e",
          info: "#09c2de",
        },
        // Alias legasi "academy" dipetakan ke warna utama baharu
        academy: {
          50: "#ebeeff",
          100: "#e0e5ff",
          200: "#c8cffb",
          300: "#a9b4f9",
          400: "#8a95f4",
          500: "#7383fa",
          600: "#6576ff",
          700: "#5664d9",
          800: "#4a54b8",
          900: "#3e478f",
          950: "#232a55",
          DEFAULT: "#6576ff",
        },
        // Alias legasi "veltrix" dipetakan ke kelabu gelap baharu
        veltrix: { ...slatePalette, DEFAULT: "#364a63" },
        // Alias legasi "brand" dipetakan ke warna utama baharu
        brand: {
          DEFAULT: "#6576ff",
          purple: "#6576ff",
          blue: "#6576ff",
          50: "#ebeeff",
          100: "#e0e5ff",
          500: "#6576ff",
          600: "#6576ff",
          700: "#5664d9",
          800: "#4a54b8",
          900: "#3e478f",
        },
        // Alias legasi "accent" dipetakan ke warna utama baharu
        accent: {
          DEFAULT: "#6576ff",
          500: "#6576ff",
          600: "#5664d9",
          700: "#4a54b8",
        },
        // Alias legasi "gold" dipetakan ke kuning status
        gold: {
          50: "#fdf8e7",
          100: "#fdf3d7",
          200: "#fbe8ae",
          300: "#f9dd85",
          400: "#f6cd4b",
          500: "#f4bd0e",
          600: "#d9a30c",
          700: "#b4870a",
          800: "#8f6c08",
          900: "#6b5006",
          DEFAULT: "#f4bd0e",
        },
        // Semantik (mengikut warna status StafKita)
        success: { DEFAULT: "#1ee0ac", soft: "#d8f7ee" },
        warning: { DEFAULT: "#f4bd0e", soft: "#fdf3d7" },
        danger:  { DEFAULT: "#e85347", soft: "#fde8e6" },
        info:    { DEFAULT: "#09c2de", soft: "#dcf7fb" },
      },
      backgroundImage: {
        // Gradien legasi dimetakan ke warna padu tema baharu
        "brand-gradient": "linear-gradient(#6576ff, #6576ff)",
        "academy-gradient": "linear-gradient(#101924, #101924)",
        "hero-mesh": "linear-gradient(#ffffff, #ffffff)",
      },
      boxShadow: {
        // Bayang hanya untuk elemen terapung; kad biasa guna sempadan
        card: "0 1px 2px 0 rgba(28, 43, 70, 0.05)",
        "card-hover": "0 3px 12px 1px rgba(44, 55, 130, 0.15)",
        elevated: "0 12px 32px rgba(28, 43, 70, 0.18)",
        focus: "0 0 0 3px rgba(101, 118, 255, 0.20)",
      },
      borderRadius: {
        // Sudut 4px untuk semua elemen bertema
        xl: "4px",
        "2xl": "4px",
        "3xl": "4px",
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
