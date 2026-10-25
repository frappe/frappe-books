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
      'posting_datetime',
      'warehouse',
      'batch_no',
      'serial_no',
      'item_code',
      'incoming_rate',
      'actual_qty',
      'voucher_type',
      'voucher_no',
    ],
  };

  static override getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'posting_datetime',
        'item_code',
        'warehouse',
        'incoming_rate',
        'actual_qty',
        'voucher_no',
      ],
    };
  }
}
