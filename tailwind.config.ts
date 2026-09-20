import type { Config } from "tailwindcss";

/**
 * Sistem reka bentuk Kuizen, semakan September 2026.
 *
 * Satu aksen sahaja: violet #7057D9. Selebihnya kelabu arang di atas putih
 * dan kelabu sangat pucat. Tiada gradien besar, tiada warna kedua yang
 * bersaing. Kalau sesuatu perlu menonjol, ia satu-satunya benda violet pada
 * skrin itu.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        brand: {
          purple: "#7057D9",
          // Dikekalkan supaya kelas lama tidak pecah semasa peralihan.
          blue: "#7057D9",
        },
        ink: {
          DEFAULT: "#15161B",
          muted: "#5B6071",
          faint: "#8A8F9E",
        },
        hairline: "#EBECF0",
        canvas: "#FBFBFC",
      },
      backgroundImage: {
        // Kekal sebagai nama, tetapi kini satu warna rata. Kelas lama yang
        // memanggil bg-brand-gradient tidak lagi menghasilkan gradien besar.
        "brand-gradient": "linear-gradient(180deg, #7057D9 0%, #7057D9 100%)",
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(21, 22, 27, 0.04)",
        raised: "0 4px 16px rgba(21, 22, 27, 0.08)",
      },
      maxWidth: {
        shell: "1240px",
      },
    },
  },
  plugins: [],
};
export default config;
