import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books Payment Method, served by Frappe; the server checks its account against its type. */
export class PaymentMethod extends FrappeDoc {
  static override doctype = 'Books Payment Method';
  static override presentation = {
    label: 'Payment Method',
    nameField: { label: 'Name' },
    quickEditFields: ['name', 'type', 'account', 'requires_clearance_date'],
    fields: { account: { create: false } },
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'type'],
    };
  }
}
