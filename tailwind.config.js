/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Remap slate to a light palette (Blue Matter theme) ──────────────────
        // Dark slate values in JSX → inverted light equivalents
        slate: {
          50:  "#0f172a",  // darkest — primary headings
          100: "#1e293b",  // primary body text
          200: "#1e293b",  // primary body text (alias)
          300: "#334155",  // secondary labels
          400: "#334155",  // secondary labels (alias)
          500: "#475569",  // hint / descriptive text  — 5.9:1 on white, WCAG AA
          600: "#52637a",  // subtle text             — 5.1:1 on white, WCAG AA
          700: "#94a3b8",  // borders / dividers (not used for text)
          800: "#e2e8f0",  // card borders
          900: "#ffffff",  // white card backgrounds
          950: "#f0f4f8",  // off-white page background
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
