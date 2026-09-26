import { Action, ListViewSettings } from 'fyo/model/types';
import {
  getStockTransferActions,
  getDocStatusListColumn,
} from 'models/helpers';
import { PurchaseReceiptItem } from './PurchaseReceiptItem';
import { StockTransfer } from './StockTransfer';
import { Fyo } from 'fyo';
import { ModelNameEnum } from 'models/types';

export class PurchaseReceipt extends StockTransfer {
  items?: PurchaseReceiptItem[];

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'party',
        'date',
        'grandTotal',
      ],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return getStockTransferActions(fyo, ModelNameEnum.PurchaseReceipt);
  }
}
