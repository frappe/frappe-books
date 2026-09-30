import fs from 'node:fs';
import frappeUIPreset, { content as frappeUIContent } from 'frappe-ui/tailwind';
import tailwindRtl from 'tailwindcss-rtl';

const colors = JSON.parse(
  fs.readFileSync(new URL('./colors.json', import.meta.url), {
    encoding: 'utf-8',
  })
);

const colorNames =
  'gray|red|orange|yellow|green|teal|blue|indigo|purple|pink|violet|cyan|amber';
const colorSteps = '25|50|100|200|300|400|500|600|700|800|850|875|890|900';

export default {
  presets: [frappeUIPreset],
  content: [
    ...frappeUIContent,
    './src/**/*.{vue,js,ts,jsx,tsx}',
    // Phone layouts name their icons.
    './reports/**/*.ts',
  ],
  darkMode: 'class',
  safelist: [
    {
      pattern: new RegExp(`^(bg|text|border)-(${colorNames})-(${colorSteps})$`),
      variants: ['dark', 'hover', 'focus', 'focus-within', 'group-hover'],
    },
    'text-start',
    'text-center',
    'text-end',
  ],
  theme: {
    fontFamily: {
      sans: ['InterVar', 'sans-serif'],
    },
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
    extend: {
      // Compatibility shades used by Books layouts.
      colors: {
        gray: Object.fromEntries(
          ['25', '850', '875', '890'].map((shade) => [
            shade,
            colors.gray[shade],
          ])
        ),
        indigo: colors.indigo,
      },
      maxHeight: {
        64: '16rem',
      },
      minWidth: {
        40: '10rem',
        56: '14rem',
      },
      maxWidth: {
        32: '8rem',
        56: '14rem',
      },
      spacing: {
        7: '1.75rem',
        14: '3.5rem',
        18: '4.5rem',
        28: '7rem',
        72: '18rem',
        80: '20rem',
      },
      gridColumn: {
        'span-full': '1 / -1',
      },
    },
  },
  plugins: [tailwindRtl],
};
