/** A print format's page size in cm. */
export type PageSize = { width: number; height: number };

export const defaultPageSize: PageSize = { width: 21, height: 29.7 };

const PAGE_SIZE = /@page\s*\{[^}]*size:\s*([\d.]+)cm\s+([\d.]+)cm/;
const PAGE_RULES = /@page\s*\{[^}]*\}|\.print-format\s*\{[^}]*\}/g;

/** The page size a print format's CSS sets, or A4. */
export function getPageSize(css?: string | null): PageSize {
  const match = css?.match(PAGE_SIZE);
  if (!match) {
    return defaultPageSize;
  }

  return { width: Number(match[1]), height: Number(match[2]) };
}

/**
 * Page rules for a borderless page: `@page` for the browser's print dialog and
 * `.print-format` properties for Frappe's PDF generators.
 */
export function getPageCSS({ width, height }: PageSize): string {
  return [
    `@page { size: ${width}cm ${height}cm; margin: 0; }`,
    `.print-format { page-size: Custom; page-width: ${width}cm; page-height: ${height}cm; ` +
      'margin: 0; margin-top: 0mm; margin-bottom: 0mm; margin-left: 0mm; margin-right: 0mm; padding: 0; }',
  ].join('\n');
}

/** The CSS with its page rules replaced by ones for `size`. */
export function setPageSize(css: string | undefined, size: PageSize): string {
  const rest = (css ?? '').replace(PAGE_RULES, '').trim();
  return [rest, getPageCSS(size)].filter(Boolean).join('\n');
}

/** A print as Frappe renders it: the body HTML and its stylesheet. */
export type PrintHTML = { html: string | null; style: string };

/** A page for a print, styled the way Frappe's print view styles it. */
export function getPrintDocument({ html, style }: PrintHTML): string {
  const boot = window.frappe?.boot;
  const direction = boot?.layout_direction === 'rtl' ? 'rtl' : 'ltr';
  const stylesheet = boot?.books?.print_style;
  const link = stylesheet ? `<link rel="stylesheet" href="${stylesheet}">` : '';
  return (
    `<!DOCTYPE html><html lang="${boot?.lang ?? 'en'}" dir="${direction}">` +
    `<head><meta charset="utf-8">${link}<style>${style}</style></head>` +
    `<body><div class="print-format">${html ?? ''}</div></body></html>`
  );
}
