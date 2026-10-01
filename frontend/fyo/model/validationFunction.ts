import { DocValue } from 'fyo/core/types';
import { getOptionList } from 'fyo/utils';
import { ValidationError, ValueError } from 'fyo/utils/errors';
import { t } from 'fyo/utils/translation';
import { Field, OptionField } from 'schemas/types';
import { getIsNullOrUndef } from 'utils';
import type { FrappeDoc } from 'src/frappe/document';

// Frappe checks Data fields with the Email and Phone options by these patterns.
const FRAPPE_EMAIL =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
const FRAPPE_PHONE = /^[0-9 +_\-,.*#()]{1,20}$/;

/** Frappe's check of an Email field, shown at the field with the Books message. */
export function validateEmail(value: DocValue) {
  const addresses = String(value ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  for (const address of addresses) {
    // Frappe also takes a named address, e.g. `Jo <jo@example.com>`.
    const email = /<([^>]*)>$/.exec(address)?.[1] ?? address;
    if (!FRAPPE_EMAIL.test(email)) {
      throw new ValidationError(t`Invalid email: ${email}`);
    }
  }
}

/** Frappe's check of a Phone field, shown at the field with the Books message. */
export function validatePhoneNumber(value: DocValue) {
  const phone = String(value ?? '').trim();
  if (phone && !FRAPPE_PHONE.test(phone)) {
    throw new ValidationError(t`Invalid phone: ${phone}`);
  }
}

export function validateOptions(field: OptionField, value: string, doc: FrappeDoc) {
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

export function validateRequired(field: Field, value: DocValue, doc: FrappeDoc) {
  if (!getIsNullOrUndef(value)) {
    return;
  }

  if (field.required || doc.required[field.fieldname]?.()) {
    throw new ValidationError(t`${field.label} is required`);
  }
}
