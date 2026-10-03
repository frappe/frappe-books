import { DateTime } from 'luxon';

export function formatXLabels(label: string) {
  return DateTime.fromISO(label).toFormat('MMM yy');
}

/**
 * Compact value ticks, and month names on phones. They replace the tick
 * formatter only, so tooltips keep the axis `format`.
 */
export function getAxisLabels(locale: string, isPhone: boolean) {
  const compact = getCompactFormat(locale);
  const phoneX = {
    axisLabel: {
      formatter: (label: string) => DateTime.fromISO(label).toFormat('MMM'),
      // Flat labels that skip months when crowded read better than tilted ones.
      rotate: 0,
    },
  };
  return {
    x: isPhone ? phoneX : undefined,
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
