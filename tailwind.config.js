/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}','./components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        coral:  '#FF6B6B',
        yellow: '#FFD93D',
        green:  '#6BCB77',
        blue:   '#4D96FF',
        ink:    '#1f2a44',
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      animation: {
        'pop': 'pop .25s cubic-bezier(.22,1,.36,1)',
      },
      keyframes: {
        pop: {
          from: { opacity: '0', transform: 'translateY(14px) scale(.98)' },
          to:   { opacity: '1', transform: 'none' },
        },
      },
    },
  },
  plugins: [],
}
