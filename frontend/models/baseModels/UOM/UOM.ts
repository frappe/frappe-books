import { FrappeDoc } from 'src/frappe/document';

/** Books UOM, served by Frappe and named by its UOM Name. */
export class UOM extends FrappeDoc {
  static override doctype = 'Books UOM';
  static override presentation = {
    label: 'UOM',
    quickEditFields: ['must_be_whole_number'],
  };
}
