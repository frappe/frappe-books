import { FrappeDoc } from 'src/frappe/document';

/** Books Inventory Settings, served by Frappe. */
export class InventorySettings extends FrappeDoc {
  static override doctype = 'Books Inventory Settings';
  static override presentation = { label: 'Inventory Settings' };

  declare show_barcode_field?: boolean;
  declare enable_batches?: boolean;
  declare enable_serial_number?: boolean;
  declare enable_uom_conversions?: boolean;
  declare enable_point_of_sale?: boolean;
}
