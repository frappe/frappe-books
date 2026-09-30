import { FrappeDoc } from 'src/frappe/document';

/** Frappe's Currency, as /books shows it: its name, fraction and symbol. */
export class Currency extends FrappeDoc {
  static override doctype = 'Currency';
  static override presentation = {
    label: 'Currency',
    quickEditFields: ['symbol'],
    // Frappe's own settings for the currency, which Books does not use.
    omitFields: ['enabled', 'number_format', 'symbol_on_right'],
  };
}
