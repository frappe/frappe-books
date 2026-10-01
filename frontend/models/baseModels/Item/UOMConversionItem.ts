import { FrappeDoc } from 'src/frappe/document';

/** A Books UOM Conversion Item row: a unit of the item and its factor. */
export class UOMConversionItem extends FrappeDoc {
  static override presentation = { label: 'UOM Conversion Item' };
}
