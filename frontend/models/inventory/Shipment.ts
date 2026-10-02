import type { Fyo } from 'fyo';
import type { Action, ListViewSettings } from 'fyo/model/types';
import {
  getDocStatusListColumn,
  getStockTransferActions,
} from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { ShipmentItem } from './ShipmentItem';
import {
  StockTransfer,
  transferFileFields,
  transferFields,
} from './StockTransfer';

export class Shipment extends StockTransfer {
  static override doctype = 'Books Shipment';
  static override presentation = {
    label: 'Shipment',
    nameField: { label: 'Transfer No', hidden: true },
    fields: transferFields,
    fileFields: transferFileFields,
  };
  static override rowModels = { items: ShipmentItem };
  static override invoiceSchemaName = ModelNameEnum.SalesInvoice;
  static override invoiceMapper = 'make_shipment';

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
    return getStockTransferActions(fyo, ModelNameEnum.Shipment);
  }
}
