import { Invoice } from '../Invoice/Invoice';
import { PurchaseInvoiceItem } from '../PurchaseInvoiceItem/PurchaseInvoiceItem';

/** A purchase invoice read through the bridge; /books forms use models/invoices. */
export class PurchaseInvoice extends Invoice {
  items?: PurchaseInvoiceItem[];
}
