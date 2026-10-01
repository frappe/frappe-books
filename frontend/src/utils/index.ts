/**
 * General purpose utils used by the frontend.
 */
import { t } from 'fyo';
import type { FrappeDoc } from 'src/frappe/document';
import {
  BaseError,
  DuplicateEntryError,
  LinkValidationError,
} from 'fyo/utils/errors';
import { Field, FieldType, FieldTypeEnum, NumberField } from 'schemas/types';
import { getSchema } from 'src/frappe/registry';

export function fuzzyMatch(input: string, target: string) {
  const keywordLetters = [...input];
  const candidateLetters = [...target];

  let keywordLetter = keywordLetters.shift();
  let candidateLetter = candidateLetters.shift();

  let isMatch = true;
  let distance = 0;

  while (keywordLetter && candidateLetter) {
    if (keywordLetter === candidateLetter) {
      keywordLetter = keywordLetters.shift();
    } else if (keywordLetter.toLowerCase() === candidateLetter.toLowerCase()) {
      keywordLetter = keywordLetters.shift();
      distance += 0.5;
    } else {
      distance += 1;
    }

    candidateLetter = candidateLetters.shift();
  }

  if (keywordLetter !== undefined) {
    distance = Number.MAX_SAFE_INTEGER;
    isMatch = false;
  } else {
    distance += candidateLetters.length;
  }

  return { isMatch, distance };
}

/** The closest fuzzy match of `keyword` among an item's values. */
export function getBestFuzzyMatch(keyword: string, values: unknown[]) {
  return values
    .filter((value) => value !== undefined && value !== null && String(value))
    .map((value) => fuzzyMatch(keyword, String(value)))
    .reduce((best, match) => (match.distance < best.distance ? match : best), {
      isMatch: false,
      distance: Number.MAX_SAFE_INTEGER,
    });
}

/** Items by how closely `keyword` fuzzy matches them; `onlyMatches` drops the rest. */
export function sortByFuzzyMatch<T>(
  keyword: string,
  items: T[],
  getValues: (item: T) => unknown[],
  onlyMatches = false
): T[] {
  if (!keyword) {
    return items;
  }

  return items
    .map((item) => ({ item, ...getBestFuzzyMatch(keyword, getValues(item)) }))
    .filter(({ isMatch }) => isMatch || !onlyMatches)
    .sort((a, b) => a.distance - b.distance)
    .map(({ item }) => item);
}

/** Link options load a page at a time, as Frappe's link search returns them. */
export const LINK_PAGE_LENGTH = 50;

export function getErrorMessage(e: Error, doc?: FrappeDoc): string {
  const errorMessage = e.message || t`An error occurred.`;

  let { schemaName, name } = doc ?? {};
  if (!doc) {
    schemaName = (e as BaseError).more?.schemaName as string | undefined;
    name = (e as BaseError).more?.value as string | undefined;
  }

  if (!schemaName || !name) {
    return errorMessage;
  }

  const label = getSchema(schemaName)?.label ?? schemaName;
  if (e instanceof LinkValidationError) {
    return t`${label} ${name} is linked with existing records.`;
  } else if (e instanceof DuplicateEntryError) {
    return t`${label} ${name} already exists.`;
  }

  return errorMessage;
}

export function isNumeric(
  fieldtype: FieldType
): fieldtype is NumberField['fieldtype'];
export function isNumeric(fieldtype: Field): fieldtype is NumberField;
export function isNumeric(
  fieldtype: Field | FieldType
): fieldtype is NumberField | NumberField['fieldtype'] {
  if (typeof fieldtype !== 'string') {
    fieldtype = fieldtype?.fieldtype;
  }

  const numericTypes: FieldType[] = [
    FieldTypeEnum.Int,
    FieldTypeEnum.Float,
    FieldTypeEnum.Currency,
  ];

  return numericTypes.includes(fieldtype);
}
