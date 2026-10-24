import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import { ModeOfPaymentAccount } from './ModeOfPaymentAccount';

/** Books Mode of Payment, served by Frappe and named by its Mode of Payment; the server checks its accounts against its type. */
export class ModeOfPayment extends FrappeDoc {
  static override doctype = 'Books Mode of Payment';
  static override presentation = {
    label: 'Mode of Payment',
    quickEditFields: ['type', 'accounts', 'requires_clearance_date'],
  };
  static override rowModels = { accounts: ModeOfPaymentAccount };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'type'],
    };
  }
}
