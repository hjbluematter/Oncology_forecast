/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Remap slate to a light palette (Blue Matter theme) ──────────────────
        // Dark slate values in JSX → inverted light equivalents
        slate: {
          50:  "#0f172a",  // was near-white → now darkest (text on light bg)
          100: "#1e293b",
          200: "#334155",
          300: "#475569",
          400: "#64748b",
          500: "#94a3b8",  // muted text (mid-grey, readable on white)
          600: "#b0bec5",  // subtle text
          700: "#d0d7de",  // light borders, dividers
          800: "#e8ecf0",  // card borders, section dividers
          900: "#ffffff",  // was near-black card bg → white cards
          950: "#f0f4f8",  // was darkest app bg → off-white page bg
        },

        // ── Remap violet to Blue Matter blue ────────────────────────────────────
        violet: {
          300: "#1d4ed8",  // hover text
          400: "#2563eb",  // primary icon/text accent
          500: "#2563eb",
          600: "#1d56c4",  // primary button, active tab
          700: "#1e40af",  // button hover
          800: "#1e3a8a",
          900: "#1e3a8a",
        },
      },
    },
  },
  plugins: [],
}
