import type { Fyo } from 'fyo';
import type { Action, ListViewSettings } from 'fyo/model/types';
import {
  getDocStatusListColumn,
  getStockTransferActions,
} from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { PurchaseReceiptItem } from './PurchaseReceiptItem';
import {
  StockTransfer,
  transferFileFields,
  transferFields,
} from './StockTransfer';

export class PurchaseReceipt extends StockTransfer {
  static override doctype = 'Books Purchase Receipt';
  static override presentation = {
    label: 'Purchase Receipt',
    nameField: { label: 'Transfer No', hidden: true },
    fields: transferFields,
    fileFields: transferFileFields,
  };
  static override rowModels = { items: PurchaseReceiptItem };
  static override invoiceSchemaName = ModelNameEnum.PurchaseInvoice;
  static override invoiceMapper = 'make_purchase_receipt';

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'party',
        'date',
        'grand_total',
      ],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return getStockTransferActions(fyo, ModelNameEnum.PurchaseReceipt);
  }
}
