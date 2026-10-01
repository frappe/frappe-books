import { fyo } from 'src/initFyo';

/** The system date format in the tokens frappe-ui's date pickers read. */
export function getDatePickerFormat(): string {
  const format = fyo.singles.SystemSettings?.date_format ?? 'MMM d, y';
  return String(format)
    .replace(/yyyy|y/g, 'YYYY')
    .replace(/dd|d/g, 'DD');
}
