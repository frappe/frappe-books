import {
  StockTransferItem,
  getTransferRowFields,
  transferRowLinks,
} from './StockTransferItem';

export class DeliveryNoteItem extends StockTransferItem {
  static override invoiceField = 'against_sales_invoice';
  static override presentation = {
    label: 'DeliveryNote Item',
    quickEditFields: getTransferRowFields(DeliveryNoteItem.invoiceField),
    fields: transferRowLinks,
  };
}
