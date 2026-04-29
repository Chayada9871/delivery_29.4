/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          900: "#7c2d12",
        },
      },
      boxShadow: {
        soft: "0 18px 40px rgba(15, 23, 42, 0.08)",
      },
      fontFamily: {
        sans: ["Prompt", "sans-serif"],
      },
    },
  },
  plugins: [],
};
