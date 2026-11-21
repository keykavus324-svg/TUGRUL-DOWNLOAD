/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: { 950: "#07080c", 900: "#0b0d13", 850: "#0f1219", 800: "#141821", 700: "#1b202b", 600: "#252b38" },
        gold: { 400: "#f7c948", 500: "#e8ac2b", 600: "#c98a12" },
        teal: { 400: "#2dd4bf", 500: "#14b8a6" },
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk Variable", "Space Grotesk", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 24px 60px -30px rgba(0,0,0,0.9)",
        glow: "0 0 0 1px rgba(247,201,72,0.25), 0 18px 60px -18px rgba(247,201,72,0.35)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        floaty: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        pulseRing: {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "70%": { transform: "scale(1.6)", opacity: "0" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        shimmer: "shimmer 2.4s infinite",
        floaty: "floaty 5s ease-in-out infinite",
        pulseRing: "pulseRing 2.2s cubic-bezier(0.2,0.6,0.3,1) infinite",
      },
    },
  },
  plugins: [],
};
