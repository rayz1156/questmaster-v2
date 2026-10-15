import type { Config } from "tailwindcss";

/**
 * Sistem reka bentuk Kuizen, semakan Oktober 2026 (KZ-020).
 *
 * Aksen utama #854fff, tajuk #364a63, badan #526484, teks lembut
 * #8094ae, latar #f5f6fa, sempadan #dbdfea. Kad putih tanpa sempadan
 * dengan bayang lembut dan sudut 4px.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Bar sisi penuh bermula 1200px (tiket KZ-020 baris 17).
      screens: {
        xl: "1200px",
      },
      fontFamily: {
        sans: [
          "DM Sans",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        brand: {
          purple: "#854fff",
          // Dikekalkan supaya kelas lama tidak pecah semasa peralihan.
          blue: "#854fff",
        },
        ink: {
          DEFAULT: "#364a63",
          muted: "#526484",
          faint: "#8094ae",
        },
        hairline: "#dbdfea",
        canvas: "#f5f6fa",
        // Palet berwarna ikut indeks (KZ-020): setiap kunci ialah warna
        // aksen atau latar lembutnya, untuk avatar, petak inisial dan carta.
        kz: {
          "accent-soft": "#ebe2ff",
          chart: "#6576ff",
          "chart-soft": "#e5e9ff",
          line: "#e5e9f2",
          "menu-active": "#ebeef2",
          up: "#1ee0ac",
          "up-soft": "#d2f9ee",
          down: "#e85347",
          "down-soft": "#fbe5e3",
          warn: "#f4bd0e",
          "warn-soft": "#fdf3d3",
          info: "#09c2de",
          "info-soft": "#ceeef6",
        },
      },
      backgroundImage: {
        // Kekal sebagai nama, tetapi kini satu warna rata. Kelas lama yang
        // memanggil bg-brand-gradient tidak lagi menghasilkan gradien besar.
        "brand-gradient": "linear-gradient(180deg, #854fff 0%, #854fff 100%)",
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        // Bayang kad LMS: putih tanpa sempadan, lembut di tepi.
        card: "0 0 25px -12px rgba(31, 43, 58, 0.15)",
        raised: "0 4px 16px rgba(21, 22, 27, 0.08)",
        // Bar sisi dan kepala.
        bar: "0 1px 3px rgba(54, 74, 99, 0.05)",
      },
      keyframes: {
        // Animasi pop ringkas untuk lencana rentak (streak) pada skrin pemain.
        // Sentiasa dipasangkan dengan motion-safe: supaya prefers-reduced-motion
        // dihormati.
        pop: {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "60%": { transform: "scale(1.08)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        // Titik merah berdenyut pada kad "Live now" (KZ-020).
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
      },
      animation: {
        pop: "pop 0.25s ease-out",
        "pulse-dot": "pulseDot 1.2s ease-in-out infinite",
      },
      maxWidth: {
        shell: "1240px",
      },
    },
  },
  plugins: [],
};
export default config;
