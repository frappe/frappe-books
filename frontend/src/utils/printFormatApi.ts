import { call } from 'src/web/api';
import { downloadFile } from './browser';
import type { PrintHTML } from './printFormats';

/** A saved document printed with a saved print format. */
export async function getPrintHTML(
  doctype: string,
  name: string,
  printFormat: string
): Promise<PrintHTML> {
  return await call<PrintHTML>('frappe.www.printview.get_html_and_style', {
    doc: doctype,
    name,
    print_format: printFormat,
  });
}

/** Downloads Frappe's PDF of a saved document. */
export async function downloadPDF(
  doctype: string,
  name: string,
  printFormat: string
): Promise<void> {
  const params = new URLSearchParams({ doctype, name, format: printFormat });
  const response = await fetch(
    `/api/method/frappe.utils.print_format.download_pdf?${params.toString()}`
  );
  if (!response.ok) {
    throw new Error(await getServerMessage(response));
  }

  const pdf = new Uint8Array(await response.arrayBuffer());
  downloadFile(pdf, `${name}.pdf`, 'application/pdf');
}

/** Opens Frappe's print view of a saved document, which opens the print dialog. */
export function openPrintView(
  doctype: string,
  name: string,
  printFormat: string
): boolean {
  const params = new URLSearchParams({
    doctype,
    name,
    format: printFormat,
    trigger_print: '1',
  });
  return !!window.open(`/printview?${params.toString()}`, '_blank');
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
