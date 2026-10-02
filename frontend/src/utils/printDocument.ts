import { t } from 'fyo';
import { printHtml } from './browser';
import { showToast } from './interactive';

export function constructPrintDocument(
  name: string,
  innerHTML: string,
  width: number,
  height: number
) {
  const html = document.createElement('html');
  const head = document.createElement('head');
  const body = document.createElement('body');
  html.dataset.theme = 'light';
  body.className = 'bg-surface-base text-ink-gray-9';
  const style = getAllCSSAsStyleElem();

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

  const meta = document.createElement('meta');
  meta.setAttribute('charset', 'UTF-8');
  const title = document.createElement('title');
  title.textContent = name;
  head.append(meta, title, style, printCSS);

  body.innerHTML = innerHTML;
  html.append(head, body);
  return html.outerHTML;
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
