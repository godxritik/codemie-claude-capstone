/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Brand palette: #EFE8DD (cream), #76ABAE (teal), #303841 (charcoal), #FF5722 (orange).
      // `brand` is teal everywhere (buttons, focus rings, the primary "work" chip). `slate` is
      // overridden to the cream/charcoal pair for all theme background/text/surface classes, so
      // every existing `bg-slate-*`/`text-slate-*` usage repaints without touching each file.
      // `rose`/`amber`/`emerald` are overridden too so danger/warning/success banners and the
      // health/break/general chips stay inside this palette. `sky`/`violet`/`pink`/`fuchsia` are
      // only given values where categoryMeta.js or the decorative blobs still reference them.
      colors: {
        brand: {
          50: '#f0f6f6',
          100: '#dceaea',
          200: '#bcd8d9',
          300: '#aecfd0',
          400: '#8bb9bb',
          500: '#76ABAE',
          600: '#5f9094',
          700: '#4c747a',
          800: '#3a5a60',
          900: '#2a4347',
        },
        slate: {
          50: '#f6f3ec',
          100: '#EFE8DD',
          200: '#d8d0c0',
          300: '#bfb6a3',
          400: '#a39b89',
          500: '#8c8575',
          600: '#6b6456',
          700: '#4a5560',
          800: '#3c4550',
          900: '#303841',
          950: '#1c2127',
        },
        rose: {
          200: '#ffd0ba',
          300: '#ffab85',
          400: '#ff7a4d',
          500: '#FF5722',
          600: '#e6481a',
        },
        amber: {
          200: '#ffdcc2',
          300: '#ffbd8f',
          400: '#ff9c5c',
          500: '#ff7a33',
        },
        emerald: {
          200: '#dcebeb',
          300: '#c3dddd',
          400: '#aecfd0',
          500: '#9cc5c7',
        },
        sky: {
          300: '#aecfd0',
          400: '#8bb9bb',
          500: '#76ABAE',
        },
        violet: {
          300: '#8bb9bb',
          400: '#5f9094',
          500: '#4c747a',
        },
        pink: {
          300: '#ffcdb8',
          400: '#ffb499',
          500: '#ff9c7a',
        },
        fuchsia: {
          600: '#ff8a4d',
        },
      },
      keyframes: {
        blob: {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -40px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.95)' },
        },
        'fade-in': {
          '0%': { opacity: 0, transform: 'translateY(4px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        blob: 'blob 18s infinite ease-in-out',
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
