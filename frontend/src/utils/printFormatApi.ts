import { getHeaders } from 'src/web/api';
import { call } from 'src/web/api';
import { downloadFile } from './browser';
import type { PrintHints, PrintHTML } from './printFormats';

/** The print formats, default first, and letter heads accessory mode offers for a doctype. */
export interface PrintOptions {
  print_formats: string[];
  letter_heads: string[];
  default_letter_head: string | null;
}

/** A saved document printed with a saved print format. */
export async function getPrintHTML(
  doctype: string,
  name: string,
  printFormat: string,
  letterHead?: string
): Promise<PrintHTML> {
  return await call<PrintHTML>('frappe.www.printview.get_html_and_style', {
    doc: doctype,
    name,
    print_format: printFormat,
    ...getLetterHeadArgs(letterHead),
  });
}

/** ERPNext's print formats and letter heads for the document; a POS invoice's POS Profile format comes first. */
export async function getPrintOptions(
  doctype: string,
  name: string
): Promise<PrintOptions> {
  return await call<PrintOptions>(
    'frappe_books.accessory.printing.get_print_options',
    { doctype, name }
  );
}

/** A saved document printed with unsaved print format HTML and CSS. */
export async function previewPrintHTML(
  doctype: string,
  name: string,
  html: string,
  css?: string
): Promise<PrintHTML> {
  return await call<PrintHTML>('frappe_books.printing.preview_print_format', {
    doctype,
    name,
    html,
    css,
  });
}

/** The values a print format for the doctype can show, by name. */
export async function getPrintHints(doctype: string): Promise<PrintHints> {
  return await call<PrintHints>('frappe_books.printing.get_print_hints', {
    doctype,
  });
}

/** Downloads Frappe's PDF of a saved document. */
export async function downloadPDF(
  doctype: string,
  name: string,
  printFormat: string,
  letterHead?: string
): Promise<void> {
  const pdf = await getPDF(doctype, name, printFormat, letterHead);
  downloadFile(new Uint8Array(await pdf.arrayBuffer()), pdf.name, pdf.type);
}

/** Frappe's PDF of a saved document, as a file named after it. */
export async function getPDF(
  doctype: string,
  name: string,
  printFormat: string,
  letterHead?: string
): Promise<File> {
  const params = new URLSearchParams({
    doctype,
    name,
    format: printFormat,
    ...getLetterHeadArgs(letterHead),
  });
  const response = await fetch(
    `/api/method/frappe.utils.print_format.download_pdf?${params.toString()}`
  );
  return await getPDFFile(response, name);
}

/** Frappe's PDF of a report print document, as a file with the given name. */
export async function getReportPDF(name: string, html: string): Promise<File> {
  const response = await fetch(
    '/api/method/frappe.utils.print_format.report_to_pdf',
    {
      method: 'POST',
      headers: getHeaders(),
      // The document's page size is already turned for landscape.
      body: JSON.stringify({ html, orientation: 'Portrait' }),
    }
  );
  return await getPDFFile(response, name);
}

/** Whether the browser can hand a PDF to the system share sheet. */
export function canSharePDF(): boolean {
  const probe = new File([], 'probe.pdf', { type: 'application/pdf' });
  return navigator.canShare?.({ files: [probe] }) ?? false;
}

/** Opens Frappe's print view of a saved document, which opens the print dialog. */
export function openPrintView(
  doctype: string,
  name: string,
  printFormat: string,
  letterHead?: string
): boolean {
  const params = new URLSearchParams({
    doctype,
    name,
    format: printFormat,
    ...getLetterHeadArgs(letterHead),
    trigger_print: '1',
  });
  return !!window.open(`/printview?${params.toString()}`, '_blank');
}

/** No letter head leaves it to Print Settings; '' prints none. */
function getLetterHeadArgs(letterHead?: string): Record<string, string> {
  if (letterHead === undefined) {
    return {};
  }

  return letterHead ? { letterhead: letterHead } : { no_letterhead: '1' };
}

async function getPDFFile(response: Response, name: string): Promise<File> {
  if (!response.ok) {
    throw new Error(await getServerMessage(response));
  }

  return new File([await response.arrayBuffer()], `${name}.pdf`, {
    type: 'application/pdf',
  });
}

async function getServerMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as {
    _server_messages?: string;
  };
  const messages = JSON.parse(body._server_messages ?? '[]') as string[];
  const text = messages
    .map((message) => (JSON.parse(message) as { message: string }).message)
    .join('\n');
  return text || response.statusText;
}
