import { t } from 'fyo';
import { printHtml } from './browser';
import { showToast } from './interactive';

export function constructPrintDocument(
  name: string,
  innerHTML: string,
  width: number,
  height: number
) {
  const body = document.createElement('body');
  body.className = 'bg-surface-base text-ink-gray-9';
  body.innerHTML = innerHTML;

  const printCSS = document.createElement('style');
  printCSS.innerHTML = `
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: white;
        width: ${width}cm;
        min-height: ${height}cm;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      @page {
        margin: 0;
        size: ${width}cm ${height}cm;
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
    }
  `;

  const html = buildDocument(name, body, [getAllCSSAsStyleElem(), printCSS]);
  html.dataset.theme = 'light';
  return html.outerHTML;
}

/** A print document for Frappe's PDF renderer, which gets no app styles. */
export function constructPDFDocument(
  name: string,
  innerHTML: string,
  width: number,
  height: number
) {
  // Frappe reads the PDF's page size and margins from the print-format rule.
  const style = document.createElement('style');
  style.textContent = `
    .print-format {
      page-size: Custom;
      page-width: ${(width * 10).toFixed(1)}mm;
      page-height: ${(height * 10).toFixed(1)}mm;
      margin-top: 0;
      margin-right: 0;
      margin-bottom: 0;
      margin-left: 0;
      font-family: sans-serif;
    }
  `;

  const body = document.createElement('body');
  body.className = 'print-format';
  body.innerHTML = innerHTML;
  return buildDocument(name, body, [style]).outerHTML;
}

function buildDocument(
  name: string,
  body: HTMLElement,
  styles: HTMLStyleElement[]
): HTMLElement {
  const meta = document.createElement('meta');
  meta.setAttribute('charset', 'UTF-8');
  const title = document.createElement('title');
  title.textContent = name;
  const head = document.createElement('head');
  head.append(meta, title, ...styles);

  const html = document.createElement('html');
  html.append(head, body);
  return html;
}

function getAllCSSAsStyleElem() {
  const cssTexts: string[] = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        cssTexts.push(rule.cssText);
      }

      if (sheet.ownerRule) {
        cssTexts.push(sheet.ownerRule.cssText);
      }
    } catch (error) {
      // Browsers block cssRules for cross-origin stylesheets. The remaining
      // same-origin application styles are still enough to print the document.
      if (!(error instanceof DOMException)) {
        throw error;
      }
    }
  }

  const styleElem = document.createElement('style');
  styleElem.innerHTML = cssTexts.join('\n');
  return styleElem;
}

/** Opens the browser's print dialog for the HTML. */
export async function printDocument(
  name: string,
  innerHTML: string,
  width: number,
  height: number
) {
  const html = constructPrintDocument(name, innerHTML, width, height);
  const success = await printHtml(html);
  if (success) {
    showToast({ message: t`Print dialog opened`, type: 'success' });
  } else {
    showToast({ message: t`Pop-up blocked`, type: 'error' });
  }
}
