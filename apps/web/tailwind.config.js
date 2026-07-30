/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1c2523',
        paper: '#faf7f0',
        teal: {
          50: '#eef7f6',
          100: '#d7ece9',
          200: '#b0d9d3',
          300: '#82c0b7',
          400: '#57a599',
          500: '#3a8a7d',
          600: '#2c6f65',
          700: '#245852',
          800: '#1f4642',
          900: '#1b3a37',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(28, 37, 35, 0.06), 0 1px 12px rgba(28, 37, 35, 0.05)',
      },
    },
  },
  plugins: [],
};
