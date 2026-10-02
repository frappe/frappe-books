import frappeUIPreset, { content as frappeUIContent } from 'frappe-ui/tailwind';
import tailwindRtl from 'tailwindcss-rtl';

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
  },
  plugins: [tailwindRtl],
};
