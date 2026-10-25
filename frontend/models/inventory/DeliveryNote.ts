import type { Fyo } from 'fyo';
import type { Action, ListViewSettings } from 'fyo/model/types';
import {
  getDocStatusListColumn,
  getStockTransferActions,
} from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { DeliveryNoteItem } from './DeliveryNoteItem';
import {
  StockTransfer,
  getTransferFileFields,
  transferFields,
} from './StockTransfer';

export class DeliveryNote extends StockTransfer {
  static override doctype = 'Books Delivery Note';
  static override presentation = {
    label: 'Delivery Note',
    nameField: { label: 'Transfer No', hidden: true },
    fields: transferFields,
    fileFields: getTransferFileFields('customer'),
  };
  static override partyField = 'customer';
  static override rowModels = { items: DeliveryNoteItem };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'customer',
        'posting_date',
        'grand_total',
      ],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return getStockTransferActions(fyo, ModelNameEnum.DeliveryNote);
  }
}
