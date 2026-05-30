/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Theme is controlled in-app (System/Light/Dark) by toggling `.dark` on
  // <html>; see src/lib/theme.js. `class` lets users override the OS setting.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
        },
      },
      fontFamily: {
        sans: ['ui-rounded', 'Nunito', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
