import fs from 'node:fs';
import frappeUIPreset, { content as frappeUIContent } from 'frappe-ui/tailwind';
import tailwindRtl from 'tailwindcss-rtl';

const colors = JSON.parse(
  fs.readFileSync(new URL('./colors.json', import.meta.url), {
    encoding: 'utf-8',
  })
);

export default {
  presets: [frappeUIPreset],
  content: [
    ...frappeUIContent,
    './src/**/*.{vue,js,ts,jsx,tsx}',
    // Phone layouts name their icons.
    './reports/**/*.ts',
  ],
  safelist: [
    // Report print cells align with `text-${align}`.
    'text-start',
    'text-center',
    'text-end',
  ],
  theme: {
    fontFamily: {
      sans: ['InterVar', 'sans-serif'],
    },
    extend: {
      // The colour picker's selected swatch ring in dark mode.
      colors: { gray: { 850: colors.gray['850'] } },
    },
  },
  plugins: [tailwindRtl],
};
