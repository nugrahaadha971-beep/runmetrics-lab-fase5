import plugin from 'tailwindcss/plugin'
import { tokens } from './src/tokens.js'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { ...tokens },
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '24px' },
      backgroundImage: {
        app: 'linear-gradient(160deg, var(--bg-from), var(--bg-to))',
        accent: 'linear-gradient(90deg, var(--accent-from), var(--accent-to))',
        'accent-v': 'linear-gradient(180deg, var(--accent-from), var(--accent-to))',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': Object.fromEntries(
          Object.entries(tokens).map(([name, value]) => [`--${name}`, value]),
        ),
      })
    }),
  ],
}
