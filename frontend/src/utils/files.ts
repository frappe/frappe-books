const FILE_URL_PREFIXES = ['/files/', '/private/files/'];

export function isFileUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    FILE_URL_PREFIXES.some((prefix) => value.startsWith(prefix)) &&
    !value.split('/').includes('..')
  );
}

export function getFileName(url: string): string {
  return decodeURIComponent(url.split('/').at(-1) ?? url);
}
