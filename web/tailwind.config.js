/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#0a0a0f', soft: '#13131b', card: '#1b1b25' },
        accent: { DEFAULT: '#a855f7', soft: '#7e22ce', hover: '#c084fc' }
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    }
  },
  plugins: []
};
