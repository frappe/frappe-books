import type { Fyo } from 'fyo';
import { Money } from 'pesa';

/**
 * And so should not contain any platform specific imports.
 */
export function getValueMapFromList<T, K extends keyof T, V extends keyof T>(
  list: T[],
  key: K,
  valueKey: V,
  filterUndefined = true
): Record<string, T[V]> {
  if (filterUndefined) {
    list = list.filter(
      (f) =>
        (f[valueKey] as unknown) !== undefined &&
        (f[key] as unknown) !== undefined
    );
  }

  return list.reduce((acc, f) => {
    const keyValue = String(f[key]);
    const value = f[valueKey];
    acc[keyValue] = value;
    return acc;
  }, {} as Record<string, T[V]>);
}

export function getRandomString(): string {
  const randomNumber = Math.random().toString(36).slice(2, 8);
  const currentTime = Date.now().toString(36);
  return `${randomNumber}-${currentTime}`;
}

export function getMapFromList<T, K extends keyof T>(
  list: T[],
  name: K
): Record<string, T> {
  /**
   * Do not convert function to use copies of T
   * instead of references.
   */
  const acc: Record<string, T> = {};
  for (const t of list) {
    const key = t[name];
    if (key === undefined) {
      continue;
    }

    acc[String(key)] = t;
  }
  return acc;
}

export function getIsNullOrUndef(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function titleCase(phrase: string): string {
  return phrase
    .split(' ')
    .map((word) => {
      const wordLower = word.toLowerCase();
      if (['and', 'an', 'a', 'from', 'by', 'on'].includes(wordLower)) {
        return wordLower;
      }
      return wordLower[0].toUpperCase() + wordLower.slice(1);
    })
    .join(' ');
}

function safeParseNumber(value: unknown, parser: (v: string) => number) {
  let parsed: number;
  switch (typeof value) {
    case 'string':
      parsed = parser(value);
      break;
    case 'number':
      parsed = value;
      break;
    default:
      parsed = Number(value);
      break;
  }

  if (Number.isNaN(parsed)) {
    return 0;
  }

  return parsed;
}

export function safeParseFloat(value: unknown): number {
  return safeParseNumber(value, Number);
}

export function safeParseInt(value: unknown): number {
  return safeParseNumber(value, (v: string) => Math.trunc(Number(v)));
}

export function safeParsePesa(value: unknown, fyo: Fyo): Money {
  if (value instanceof Money) {
    return value;
  }

  if (typeof value === 'number') {
    return fyo.pesa(value);
  }

  if (typeof value === 'bigint') {
    return fyo.pesa(value);
  }

  if (typeof value !== 'string') {
    return fyo.pesa(0);
  }

  try {
    return fyo.pesa(value);
  } catch {
    return fyo.pesa(0);
  }
}

/**
 * Asserts that `value` is of type T. Use with care.
 */
export const assertIsType = <T>(_value: unknown): _value is T => true;
