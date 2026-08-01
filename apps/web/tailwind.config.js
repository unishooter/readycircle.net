/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1c2523',
        paper: '#faf7f0',
        // Primary brand color, from the ReadyCircle style guide's "Blue
        // theme palette" (#1F2D3D, #4C6B8A, #7FA2C4, #9AA6B2, #D6DCE3).
        // Intermediate shades are interpolated to fill out a full
        // Tailwind-style ramp.
        navy: {
          50: '#f1f4f7',
          100: '#d6dce3',
          200: '#c3ccd6',
          300: '#9aa6b2',
          400: '#7fa2c4',
          500: '#6889aa',
          600: '#4c6b8a',
          700: '#33465c',
          800: '#1f2d3d',
          900: '#141c26',
        },
        // Secondary accent color, from the style guide's "Orange theme
        // palette" (#D9772A, #E19B56, #F2C9A4, #F4D9BC, #F7E9DA) -- the
        // color used for the logo's ".net" text and icon accent dot.
        ember: {
          50: '#fcf3ea',
          100: '#f7e9da',
          200: '#f4d9bc',
          300: '#f2c9a4',
          400: '#ecb27e',
          500: '#e19b56',
          600: '#d9772a',
          700: '#b8621f',
          800: '#935017',
          900: '#6e3c11',
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
