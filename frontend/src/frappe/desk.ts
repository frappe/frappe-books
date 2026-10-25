/** Desk's pages for what accessory mode shows, as Frappe's `get_form_link` and `get_url_to_report` route them. */

function slug(doctype: string): string {
  return encodeURIComponent(doctype.toLowerCase().replace(/ /g, '-'));
}

export function getDeskFormUrl(doctype: string, name: string): string {
  return `/desk/${slug(doctype)}/${encodeURIComponent(name)}`;
}

export function getDeskListUrl(doctype: string): string {
  return `/desk/${slug(doctype)}`;
}

export function getDeskTreeUrl(doctype: string): string {
  return `/desk/${slug(doctype)}/view/tree`;
}

/** A query report with the filters it was run with; Desk reads them from the query string. */
export function getDeskReportUrl(
  reportName: string,
  filters: Record<string, unknown> = {}
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    query.set(
      key,
      typeof value === 'object' ? JSON.stringify(value) : String(value)
    );
  }

  const search = query.toString();
  return `/desk/query-report/${encodeURIComponent(reportName)}${search ? `?${search}` : ''}`;
}

/** Desk opens beside Books, which keeps its place. */
export function openInDesk(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
