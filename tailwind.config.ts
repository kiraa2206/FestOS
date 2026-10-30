import type {Config} from 'tailwindcss'
const v = (n: string) => `rgb(var(--${n}) / <alpha-value>)`
export default {darkMode: 'media', content: ['./index.html', './src/**/*.{ts,tsx}'], theme: {extend: {colors: {bg: v('bg'), surface: v('surface'), surface2: v('surface2'), fg: v('fg'), accent: v('accent')}}}, plugins: []} satisfies Config
