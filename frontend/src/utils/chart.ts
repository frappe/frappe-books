import { DateTime } from 'luxon';

function getRoundingConst(val: number): number {
  const pow = Math.max(Math.log10(Math.abs(val)) - 1, 0);
  return 10 ** Math.floor(pow);
}

function getVal(minOrMaxVal: number): number {
  const rc = getRoundingConst(minOrMaxVal);
  const sign = minOrMaxVal >= 0 ? 1 : -1;
  if (sign === 1) {
    return Math.ceil(minOrMaxVal / rc) * rc;
  }
  return Math.floor(minOrMaxVal / rc) * rc;
}

export function getYMax(points: number[][]): number {
  const maxVal = Math.max(0, ...points.flat().filter(Number.isFinite));
  // A zero-width axis makes chart tick formatters receive NaN.
  if (maxVal === 0) return 1;
  return getVal(maxVal);
}

export function getYMin(points: number[][]): number {
  const minVal = Math.min(0, ...points.flat().filter(Number.isFinite));
  if (minVal === 0) {
    return minVal;
  }

  return getVal(minVal);
}

export function formatXLabels(label: string) {
  return DateTime.fromISO(label).toFormat('MMM yy');
}

/**
 * Phone axis ticks: month names and compact values. They replace the tick
 * formatter only, so tooltips keep the axis `format`.
 */
export function getPhoneAxisLabels(locale: string) {
  const compact = getCompactFormat(locale);
  return {
    x: {
      axisLabel: {
        formatter: (label: string) => DateTime.fromISO(label).toFormat('MMM'),
        // Flat labels that skip months when crowded read better than tilted ones.
        rotate: 0,
      },
    },
    y: { axisLabel: { formatter: (value: number) => compact.format(value) } },
  };
}

/** Amounts short enough for a phone tile, e.g. "₹ 1.2L". */
export function getCompactCurrencyFormat(locale: string, symbol?: string) {
  const compact = getCompactFormat(locale);
  return (value: number) =>
    symbol ? `${symbol} ${compact.format(value)}` : compact.format(value);
}

function getCompactFormat(locale: string) {
  return Intl.NumberFormat(`${locale}-u-nu-latn`, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}
