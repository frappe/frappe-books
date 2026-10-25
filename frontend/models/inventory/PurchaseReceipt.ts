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
  getTransferFileFields,
  transferFields,
} from './StockTransfer';

export class PurchaseReceipt extends StockTransfer {
  static override doctype = 'Books Purchase Receipt';
  static override presentation = {
    label: 'Purchase Receipt',
    nameField: { label: 'Transfer No', hidden: true },
    fields: transferFields,
    fileFields: getTransferFileFields('supplier'),
  };
  static override partyField = 'supplier';
  static override rowModels = { items: PurchaseReceiptItem };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'supplier',
        'posting_date',
        'grand_total',
      ],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return getStockTransferActions(fyo, ModelNameEnum.PurchaseReceipt);
  }
}
