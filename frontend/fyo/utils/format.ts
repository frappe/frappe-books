import { Fyo } from 'fyo';
import type { FrappeDoc } from 'src/frappe/document';
import { DateTime } from 'luxon';
import { Field, FieldType, FieldTypeEnum } from 'schemas/types';
import { getFloatPrecision } from 'src/utils/precision';
import { getIsNullOrUndef, safeParseFloat, titleCase } from 'utils';
import { getOptionList, isPesa } from '.';
import {
  DEFAULT_CURRENCY,
  DEFAULT_DATE_FORMAT,
  DEFAULT_DISPLAY_PRECISION,
  DEFAULT_LOCALE,
} from './consts';

export function format(
  value: unknown,
  df: string | Field | null,
  doc: FrappeDoc | null,
  fyo: Fyo
): string {
  if (!df) {
    return String(value);
  }

  const field: Field = getField(df);

  if (field.fieldtype === FieldTypeEnum.Float) {
    return formatFloat(value, fyo);
  }

  if (field.fieldtype === FieldTypeEnum.Int) {
    return Math.trunc(Number(value)).toString();
  }

  if (field.fieldtype === FieldTypeEnum.Currency) {
    return formatCurrency(value, field, doc, fyo);
  }

  if (field.fieldtype === FieldTypeEnum.Date) {
    return formatDate(value, fyo);
  }

  if (field.fieldtype === FieldTypeEnum.Datetime) {
    return formatDatetime(value, fyo);
  }

  if (field.fieldtype === FieldTypeEnum.Check) {
    return titleCase(Boolean(value).toString());
  }

  if (getIsNullOrUndef(value)) {
    return '';
  }

  if (field.fieldtype === FieldTypeEnum.Select) {
    const option = getOptionList(field, doc).find(
      ({ value: optionValue }) => optionValue === value
    );
    return option?.label ?? String(value);
  }

  return String(value);
}

/** Desk's Float formatter: the float precision, else 3 decimals, and none for a whole number. */
function formatFloat(value: unknown, fyo: Fyo): string {
  if (getIsNullOrUndef(value)) {
    return '';
  }

  const isWhole = safeParseFloat(value) % 1 === 0;
  return formatNumber(value, fyo, isWhole ? 0 : (getFloatPrecision() ?? 3));
}

function toDatetime(value: unknown): DateTime | null {
  if (typeof value === 'string') {
    return DateTime.fromISO(value);
  } else if (value instanceof Date) {
    return DateTime.fromJSDate(value);
  } else if (typeof value === 'number') {
    return DateTime.fromSeconds(value);
  }

  return null;
}

function formatDatetime(value: unknown, fyo: Fyo): string {
  if (value == null) {
    return '';
  }

  const dateFormat =
    (fyo.singles.SystemSettings?.date_format as string) ?? DEFAULT_DATE_FORMAT;
  const dateTime = toDatetime(value);
  if (!dateTime) {
    return '';
  }

  const formattedDatetime = dateTime.toFormat(`${dateFormat} HH:mm:ss`);

  if (value === 'Invalid DateTime') {
    return '';
  }

  return formattedDatetime;
}

function formatDate(value: unknown, fyo: Fyo): string {
  if (value == null) {
    return '';
  }

  const dateFormat =
    (fyo.singles.SystemSettings?.date_format as string) ?? DEFAULT_DATE_FORMAT;

  const dateTime = toDatetime(value);
  if (!dateTime) {
    return '';
  }

  const formattedDate = dateTime.toFormat(dateFormat);
  if (value === 'Invalid DateTime') {
    return '';
  }

  return formattedDate;
}

function formatCurrency(
  value: unknown,
  field: Field,
  doc: FrappeDoc | null,
  fyo: Fyo
): string {
  const currency = getCurrency(field, doc, fyo);

  let valueString;
  try {
    valueString = formatNumber(value, fyo);
  } catch (err) {
    (err as Error).message += ` value: '${String(
      value
    )}', type: ${typeof value}`;
    throw err;
  }

  const currencySymbol = fyo.currencySymbols[currency];
  if (currencySymbol !== undefined) {
    return currencySymbol + ' ' + valueString;
  }

  return valueString;
}

/** The number in the locale's format, to `precision` decimals or the display precision. */
export function formatNumber(
  value: unknown,
  fyo: Fyo,
  precision?: number
): string {
  const numberFormatter =
    precision === undefined
      ? getNumberFormatter(fyo)
      : getPrecisionFormatter(fyo, precision);
  if (typeof value === 'number') {
    value = fyo.pesa(value.toFixed(20));
  }

  if (isPesa(value)) {
    const floatValue = safeParseFloat(value.toString());
    return numberFormatter.format(floatValue);
  }

  const floatValue = safeParseFloat(value as string);
  const formattedNumber = numberFormatter.format(floatValue);

  if (formattedNumber === 'NaN') {
    throw Error(
      `invalid value passed to formatNumber: '${String(
        value
      )}' of type ${typeof value}`
    );
  }

  return formattedNumber;
}

interface Separators {
  group: string;
  decimal: string;
}

/**
 * A typed number as Frappe's desk reads it (frappe.utils.eval_expression,
 * then ControlFloat.parse): numbers read by the number format, simple
 * arithmetic evaluated, and null for text that is not a number.
 */
export function parseNumber(text: string, fyo: Fyo): number | null {
  const separators = getSeparators(fyo);
  const value = evaluateExpression(text, separators);
  if (Number.isNaN(parseFloat(String(value)))) {
    return null;
  }

  const number =
    typeof value === 'number' ? value : toNumber(value, separators);
  return Number.isFinite(number) ? number : null;
}

/** Desk's eval_expression: each number read by the number format, then plain arithmetic evaluated. */
function evaluateExpression(
  text: string,
  separators: Separators
): string | number {
  const expression = (text.match(/[^\d.,]+|[\d.,]+/g) ?? [])
    .map((part) =>
      Number.isNaN(parseFloat(part)) ? part : String(toNumber(part, separators))
    )
    .join('');
  if (!/^[0-9+\-/*.() ]+$/.test(expression)) {
    return text;
  }

  try {
    // Only digits, operators and brackets reach eval, as in Frappe's desk.
    return globalThis.eval(expression) as number;
  } catch {
    return text;
  }
}

/** Desk's flt for text: number groups dropped, the decimal separator read; 0 if no number. */
function toNumber(text: string, { group, decimal }: Separators): number {
  const number = parseFloat(
    text.replaceAll(group, '').replaceAll(decimal, '.')
  );
  return Number.isNaN(number) ? 0 : number;
}

/** The group and decimal separators of the locale numbers are formatted in. */
function getSeparators(fyo: Fyo): Separators {
  const { locale } = getNumberFormatter(fyo).resolvedOptions();
  const parts = Intl.NumberFormat(locale).formatToParts(1234567.5);
  const find = (type: string) => parts.find((part) => part.type === type);
  return {
    group: find('group')?.value ?? '',
    decimal: find('decimal')?.value ?? '.',
  };
}

/**
 * Desk's _round: the number to `precision` decimals by Frappe's rounding
 * method, or as it is without a precision.
 */
export function roundNumber(
  number: number,
  precision: number | null,
  method: string
): number {
  if (precision === null || number === 0) {
    return number;
  }

  const multiplier = 10 ** precision;
  const scaled = roundScaled(Math.abs(number) * multiplier, precision, method);
  return (Math.sign(number) * scaled) / multiplier;
}

function roundScaled(scaled: number, precision: number, method: string) {
  // Desk's allowance for float error in the scaled number.
  const epsilon = 2 ** (Math.log2(scaled) - 52);
  if (method === 'Commercial Rounding') {
    return Math.round(scaled + (epsilon < 0.25 ? epsilon : 0));
  }

  if (method === "Banker's Rounding (legacy)") {
    const fixed = +scaled.toFixed(8);
    // Only a tie to a whole number goes to the even one.
    const isTie = !precision && fixed % 1 === 0.5;
    return isTie ? roundToEven(fixed) : Math.round(fixed);
  }

  const fraction = scaled % 1;
  const isTie =
    epsilon < 0.5 ? Math.abs(fraction - 0.5) < epsilon : fraction === 0.5;
  return isTie ? roundToEven(scaled) : Math.round(scaled);
}

function roundToEven(tie: number): number {
  const floor = Math.floor(tie);
  return floor % 2 === 0 ? floor : floor + 1;
}

const precisionFormatters = new Map<string, Intl.NumberFormat>();

function getPrecisionFormatter(fyo: Fyo, precision: number) {
  const { locale } = getNumberFormatter(fyo).resolvedOptions();
  const key = `${locale}|${precision}`;
  let formatter = precisionFormatters.get(key);
  if (!formatter) {
    formatter = Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
    precisionFormatters.set(key, formatter);
  }

  return formatter;
}

function getNumberFormatter(fyo: Fyo) {
  if (fyo.currencyFormatter) {
    return fyo.currencyFormatter;
  }

  const locale =
    (fyo.singles.SystemSettings?.locale as string) ?? DEFAULT_LOCALE;
  const display =
    (fyo.singles.SystemSettings?.display_precision as number) ??
    DEFAULT_DISPLAY_PRECISION;

  // Force Latin (Western) digits for all locales by appending the Unicode
  // locale extension '-u-nu-latn'. Without this, locales like 'ar-SA' use
  // Arabic-Indic numerals (٠١٢٣) which are not suitable for accounting.
  const latnLocale = `${locale}-u-nu-latn`;
  return (fyo.currencyFormatter = Intl.NumberFormat(latnLocale, {
    style: 'decimal',
    minimumFractionDigits: display,
    maximumFractionDigits: display,
  }));
}

function getCurrency(field: Field, doc: FrappeDoc | null, fyo: Fyo): string {
  const defaultCurrency =
    fyo.singles.SystemSettings?.currency ?? DEFAULT_CURRENCY;

  let getCurrency = doc?.getCurrencies?.[field.fieldname];
  if (getCurrency !== undefined) {
    return getCurrency();
  }

  getCurrency = doc?.parentdoc?.getCurrencies[field.fieldname];
  if (getCurrency !== undefined) {
    return getCurrency();
  }

  return defaultCurrency;
}

function getField(df: string | Field): Field {
  if (typeof df === 'string') {
    return {
      label: '',
      fieldname: '',
      fieldtype: df as FieldType,
    } as Field;
  }

  return df;
}
