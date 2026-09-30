import { DocValue } from 'fyo/core/types';
import { getOptionList } from 'fyo/utils';
import { ValidationError, ValueError } from 'fyo/utils/errors';
import { t } from 'fyo/utils/translation';
import { Field, OptionField } from 'schemas/types';
import { getIsNullOrUndef } from 'utils';
import { Doc } from './doc';

export function validateEmail(value: DocValue) {
  if (typeof value !== 'string') {
    throw new TypeError(
      `Invalid email ${String(value)} of type ${typeof value}`
    );
  }

  const isValid = /(.+)@(.+){2,}\.(.+){2,}/.test(value);
  if (!isValid) {
    throw new ValidationError(`Invalid email: ${value}`);
  }
}

export function validatePhoneNumber(value: DocValue) {
  if (typeof value !== 'string') {
    throw new TypeError(
      `Invalid phone ${String(value)} of type ${typeof value}`
    );
  }

  const isValid = /[+]{0,1}[\d ]+/.test(value);
  if (!isValid) {
    throw new ValidationError(`Invalid phone: ${value}`);
  }
}

// Frappe checks Data fields with the Email and Phone options by these patterns.
const FRAPPE_EMAIL =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
const FRAPPE_PHONE = /^[0-9 +_\-,.*#()]{1,20}$/;

/** Frappe's check of an Email field, with its message, to show it at the field. */
export function validateFrappeEmail(value: DocValue) {
  const addresses = String(value ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  for (const address of addresses) {
    // Frappe also takes a named address, e.g. `Jo <jo@example.com>`.
    const email = /<([^>]*)>$/.exec(address)?.[1] ?? address;
    if (!FRAPPE_EMAIL.test(email)) {
      throw new ValidationError(t`${email} is not a valid Email Address`);
    }
  }
}

/** Frappe's check of a Phone field, with its message, to show it at the field. */
export function validateFrappePhone(value: DocValue) {
  const phone = String(value ?? '').trim();
  if (phone && !FRAPPE_PHONE.test(phone)) {
    throw new ValidationError(t`${phone} is not a valid Phone Number`);
  }
}

export function validateOptions(field: OptionField, value: string, doc: Doc) {
  const options = getOptionList(field, doc);
  if (!options.length) {
    return;
  }

  if (!field.required && !value) {
    return;
  }

  const validValues = options.map((o) => o.value);

  if (validValues.includes(value) || field.allowCustom) {
    return;
  }

  throw new ValueError(t`Invalid value ${value} for ${field.label}`);
}

export function validateRequired(field: Field, value: DocValue, doc: Doc) {
  if (!getIsNullOrUndef(value)) {
    return;
  }

  if (field.required) {
    throw new ValidationError(`${field.label} is required`);
  }

  const requiredFunction = doc.required[field.fieldname];
  if (requiredFunction && requiredFunction()) {
    throw new ValidationError(`${field.label} is required`);
  }
}
