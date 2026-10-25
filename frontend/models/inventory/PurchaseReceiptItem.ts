import {
  StockTransferItem,
  getTransferRowFields,
  transferRowLinks,
} from './StockTransferItem';

export class PurchaseReceiptItem extends StockTransferItem {
  static override invoiceField = 'purchase_invoice';
  static override presentation = {
    label: 'Purchase Receipt Item',
    quickEditFields: getTransferRowFields(PurchaseReceiptItem.invoiceField),
    fields: transferRowLinks,
  };
}
