// Decimal separators of Frappe's number formats, as its number_format_info holds them.
const NUMBER_FORMAT_DECIMALS: Record<string, string> = {
  '#,###.##': '.',
  '#.###,##': ',',
  '# ###.##': '.',
  '# ###,##': ',',
  "#'###.##": '.',
  '#, ###.##': '.',
  '#,##,###.##': '.',
  '#,###.###': '.',
  '#.###': '',
  '#,###': '',
};

/** Frappe's system defaults in the session boot, which Desk reads its number precisions from. */
function getSysDefaults() {
  return globalThis.window?.frappe?.boot?.sysdefaults ?? {};
}

/** Desk's precision of a Float field: the system float precision, or none. */
export function getFloatPrecision(): number | null {
  const precision = parseInt(getSysDefaults().float_precision ?? '');
  return Number.isNaN(precision) ? null : precision;
}

/** Desk's precision of a Currency field: the system currency precision, else that of the number format. */
export function getCurrencyPrecision(): number {
  const { currency_precision, number_format } = getSysDefaults();
  if (currency_precision) {
    return parseInt(currency_precision);
  }

  const format = number_format || '#,###.##';
  const decimal = NUMBER_FORMAT_DECIMALS[format] ?? '.';
  return decimal ? (format.split(decimal)[1]?.length ?? 0) : 0;
}

/** The rounding method Desk rounds typed numbers by. */
export function getRoundingMethod(): string {
  return getSysDefaults().rounding_method || "Banker's Rounding (legacy)";
}
