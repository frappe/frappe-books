import { FrappeDoc } from 'src/frappe/document';

/** Books Location, served by Frappe. */
export class Location extends FrappeDoc {
  static override doctype = 'Books Location';
  static override presentation = {
    label: 'Location',
    nameField: { label: 'Location Name' },
    quickEditFields: ['address'],
  };
}
