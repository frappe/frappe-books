/** A server message's text, for places that show no markup, e.g. a toast. */
export function serverHtmlToText(html: string): string {
  return new DOMParser()
    .parseFromString(html, 'text/html')
    .body.textContent!.trim();
}
