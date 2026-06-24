/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#F7F4EF",
        card: "#FFFFFF",
        ink: "#1A1A1A",
        gold: "#B8965A",
        bordeaux: "#8B1A2B",
        forest: "#2D5A3D",
        muted: "#8A857B",
        line: "#E6DFD3",
        sidebar: "#141414",
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', "serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(26,26,26,0.03), 0 12px 32px -12px rgba(26,26,26,0.10)",
        lift: "0 2px 4px rgba(26,26,26,0.04), 0 22px 48px -16px rgba(26,26,26,0.16)",
      },
      borderRadius: {
        xl2: "14px",
      },
    },
  },
  plugins: [],
};
