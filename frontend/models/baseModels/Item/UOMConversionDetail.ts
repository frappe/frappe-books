import { FrappeDoc } from 'src/frappe/document';

/** A Books UOM Conversion Detail row: a unit of the item and its factor. */
export class UOMConversionDetail extends FrappeDoc {
  static override presentation = { label: 'UOM Conversion Detail' };
}
