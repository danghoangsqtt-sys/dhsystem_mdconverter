/** @type {import('tailwindcss').Config} */
let typographyPlugin;
try {
  typographyPlugin = require('@tailwindcss/typography');
} catch (e) {
  console.warn('Warning: @tailwindcss/typography plugin not found. Markdown styling will be limited.');
}

export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
    "!./node_modules/**",
    "!./dist/**",
    "!./dist-electron/**"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [
    typographyPlugin,
  ].filter(Boolean),
}
