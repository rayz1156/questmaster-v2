import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: { sans: ["Poppins", "system-ui", "sans-serif"] },
      colors: {
        brand: {
          purple: "#9333EA",
          blue: "#2563EB",
        },
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #9333EA 0%, #2563EB 100%)",
      },
      boxShadow: {
        card: "0 4px 20px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
