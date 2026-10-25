import { FrappeDoc } from 'src/frappe/document';

/** A Books Item Barcode row: a code a scan finds the item by. */
export class ItemBarcode extends FrappeDoc {
  static override presentation = { label: 'Item Barcode' };
}
