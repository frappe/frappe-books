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

// Print templates are saved on the site, so the build cannot see their classes.
const scale =
  '(0|px|0\\.5|1|1\\.5|2|2\\.5|3|3\\.5|4|5|6|7|8|9|10|11|12|14|16|18|20|24|28|32|36|40|44|48|52|56|60|64|72|80|96|auto)';
export const printTemplateUtilities = [
  new RegExp(`^-?m[xytrbl]?-${scale}$`),
  new RegExp(`^p[xytrbl]?-${scale}$`),
  new RegExp(`^(gap|space)(-[xy])?-${scale}$`),
  new RegExp(`^[wh]-(${scale}|\\d+/\\d+|full|fit|min|max)$`),
  /^(min|max)-[wh]-(0|full|none|fit|min|max|xs|sm|md|lg|xl|[2-7]xl)$/,
  /^grid-(cols|rows)-(\d+|none)$/,
  /^(col|row)-(span|start|end)-(\d+|full|auto)$/,
  /^(block|inline|inline-block|flex|inline-flex|grid|table|hidden)$/,
  /^(flex|grow|shrink|order|justify|items|self|content)-/,
  /^text-(xs|sm|base|lg|\d?xl|left|center|right|justify)$/,
  /^font-(normal|medium|semibold|bold|mono)$/,
  /^(leading|tracking|whitespace|break|object|overflow)-/,
  /^(uppercase|lowercase|capitalize|italic|underline|truncate)$/,
  /^border(-[xytrbl])?(-\d)?$/,
  /^border-(solid|dashed|dotted|collapse)$/,
  /^rounded(-[a-z]+)?$/,
  /^table-(auto|fixed)$/,
];

export default {
  presets: [frappeUIPreset],
  content: [
    ...frappeUIContent,
    './src/**/*.{vue,js,ts,jsx,tsx}',
    '../frappe_books/data/**/*.html',
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
    ...printTemplateUtilities.map((pattern) => ({ pattern })),
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
      // Compatibility shades used by Books layouts and print templates.
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
