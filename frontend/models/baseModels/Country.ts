import { FrappeDoc } from 'src/frappe/document';

/** Frappe's Country, which addresses and the company link to. */
export class Country extends FrappeDoc {
  static override doctype = 'Country';
  // Books shows a country by its name only; its formats and time zones are Frappe's.
  static override presentation = {
    label: 'Country',
    omitFields: ['date_format', 'time_format', 'time_zones', 'code'],
  };
}
