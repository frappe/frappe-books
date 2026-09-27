import { t } from 'fyo';

export type CurrencyUnits = { fraction?: string; fractionUnits?: number };

/** Amount in words, in the currency's fraction unit and locale grouping. */
export function getAmountInWords(
  amount: number,
  { fraction, fractionUnits = 100 }: CurrencyUnits,
  locale: string
): string {
  const fractionDigits =
    fractionUnits > 1 ? Math.round(Math.log10(fractionUnits)) : 0;
  const [whole, part] = Math.abs(amount).toFixed(fractionDigits).split('.');
  const isIndian = hasIndianGrouping(locale);
  const words = getIntegerInWords(Number(whole), isIndian) || t`Zero`;

  const fractionValue = Number(part ?? 0);
  if (!fractionValue) {
    return `${words} ${t`only`}`;
  }

  const fractionWords = getIntegerInWords(fractionValue, isIndian);
  return [words, t`and`, fractionWords, fraction, t`only`]
    .filter(Boolean)
    .join(' ');
}

function hasIndianGrouping(locale: string): boolean {
  const formatted = new Intl.NumberFormat(`${locale}-u-nu-latn`).format(
    100_000
  );
  return formatted.split(/\D+/).length === 3;
}

function getIntegerInWords(value: number, isIndian: boolean): string {
  for (const [size, label] of getScales(isIndian)) {
    if (value < size) {
      continue;
    }

    const rest = value % size;
    const count = getIntegerInWords(Math.floor(value / size), isIndian);
    const head = `${count} ${label}`;
    return rest ? `${head} ${getIntegerInWords(rest, isIndian)}` : head;
  }

  return getBelowThousandInWords(value);
}

function getScales(isIndian: boolean): [number, string][] {
  if (isIndian) {
    return [
      [10_000_000, t`Crore`],
      [100_000, t`Lakh`],
      [1_000, t`Thousand`],
    ];
  }

  return [
    [1_000_000_000, t`Billion`],
    [1_000_000, t`Million`],
    [1_000, t`Thousand`],
  ];
}

function getBelowThousandInWords(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const words: string[] = [];
  if (hundreds) {
    words.push(`${getOnes()[hundreds]} ${t`Hundred`}`);
  }

  if (hundreds && rest) {
    words.push(t`And`);
  }

  if (rest) {
    words.push(getBelowHundredInWords(rest));
  }

  return words.join(' ');
}

function getBelowHundredInWords(value: number): string {
  if (value < 10) {
    return getOnes()[value];
  }

  if (value < 20) {
    return getTeens()[value - 10];
  }

  const ones = value % 10;
  const tens = getTens()[Math.floor(value / 10)];
  return ones ? `${tens} ${getOnes()[ones]}` : tens;
}

function getOnes(): string[] {
  return [
    '',
    t`One`,
    t`Two`,
    t`Three`,
    t`Four`,
    t`Five`,
    t`Six`,
    t`Seven`,
    t`Eight`,
    t`Nine`,
  ];
}

function getTeens(): string[] {
  return [
    t`Ten`,
    t`Eleven`,
    t`Twelve`,
    t`Thirteen`,
    t`Fourteen`,
    t`Fifteen`,
    t`Sixteen`,
    t`Seventeen`,
    t`Eighteen`,
    t`Nineteen`,
  ];
}

function getTens(): string[] {
  return [
    '',
    '',
    t`Twenty`,
    t`Thirty`,
    t`Forty`,
    t`Fifty`,
    t`Sixty`,
    t`Seventy`,
    t`Eighty`,
    t`Ninety`,
  ];
}
