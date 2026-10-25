/** Server messages as accessory forms show them: only text markup, lists, tables and links. */

const ALLOWED_TAGS = new Set([
  'A',
  'B',
  'BR',
  'EM',
  'I',
  'LI',
  'OL',
  'P',
  'STRONG',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL',
]);
// Their text is not message text.
const DROPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
const NUMBER = /^[-+]?[^\d\s]{0,3}\s?[\d.,]+%?$/;

/** A server message's text, for places that show no markup, e.g. a toast. */
export function serverHtmlToText(html: string): string {
  return new DOMParser()
    .parseFromString(html, 'text/html')
    .body.textContent!.trim();
}

/** HTML of several lines, like an address's, as one line of text. */
export function serverHtmlToLine(html: string): string {
  return html
    .split(/<br\s*\/?>/i)
    .map((line) => serverHtmlToText(line))
    .filter(Boolean)
    .join(', ');
}

/**
 * A server message's HTML with other elements unwrapped to their text, and
 * every attribute dropped but a link's own-site or http(s) `href`. Table
 * columns of numbers are marked to align right.
 */
export function sanitizeServerHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const sanitized = document.createElement('div');
  copyAllowed(parsed.body, sanitized);
  sanitized.querySelectorAll('table').forEach((table) => {
    markNumberColumns(table);
    wrapToScroll(table);
  });
  return sanitized.innerHTML;
}

function copyAllowed(from: Node, to: Node) {
  for (const node of Array.from(from.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      to.appendChild(document.createTextNode(node.textContent ?? ''));
    } else if (node instanceof Element && !DROPPED_TAGS.has(node.tagName)) {
      copyElement(node, to);
    }
  }
}

function copyElement(element: Element, to: Node) {
  if (!ALLOWED_TAGS.has(element.tagName)) {
    copyAllowed(element, to);
    return;
  }

  const copy = document.createElement(element.tagName.toLowerCase());
  const href = element.getAttribute('href');
  if (element.tagName === 'A' && href && isSafeHref(href)) {
    copy.setAttribute('href', href);
  }

  copyAllowed(element, copy);
  to.appendChild(copy);
}

function isSafeHref(href: string): boolean {
  const url = new URL(href, window.location.origin);
  return ['http:', 'https:'].includes(url.protocol);
}

/** A table wider than the message scrolls sideways on its own. */
function wrapToScroll(table: HTMLTableElement) {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-table', '');
  table.replaceWith(wrapper);
  wrapper.appendChild(table);
}

/** Marks the cells of each column whose body cells all hold numbers, its header included. */
function markNumberColumns(table: HTMLTableElement) {
  const rows = Array.from(table.rows).map((row) => Array.from(row.cells));
  const width = Math.max(0, ...rows.map((cells) => cells.length));
  for (let column = 0; column < width; column++) {
    const cells = rows.map((row) => row[column]).filter(Boolean);
    const body = cells.filter((cell) => cell.tagName === 'TD');
    const isNumbers =
      body.length > 0 &&
      body.every((cell) => NUMBER.test(cell.textContent?.trim() ?? ''));
    if (isNumbers) {
      cells.forEach((cell) => cell.setAttribute('data-number', ''));
    }
  }
}
