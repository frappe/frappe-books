import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books Stock Ledger Entry, served by Frappe. Only the server posts entries. */
export class StockLedgerEntry extends FrappeDoc {
  static override doctype = 'Books Stock Ledger Entry';
  static override presentation = {
    label: 'Stock Ledger Entry',
    nameField: { label: 'Entry No.' },
    fileFields: [
      'name',
      'date',
      'location',
      'batch',
      'serial_number',
      'item',
      'rate',
      'quantity',
      'reference_type',
      'reference_name',
    ],
  };

  static override getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'date',
        'item',
        'location',
        'rate',
        'quantity',
        'reference_name',
      ],
    };
  }
}
