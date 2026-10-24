import { FrappeDoc } from 'src/frappe/document';

/** Books Warehouse, served by Frappe and named by its Warehouse Name. */
export class Warehouse extends FrappeDoc {
  static override doctype = 'Books Warehouse';
  static override presentation = {
    label: 'Warehouse',
    quickEditFields: ['address'],
  };
}
