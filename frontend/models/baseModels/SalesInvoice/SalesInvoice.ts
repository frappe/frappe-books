import { Invoice } from '../Invoice/Invoice';
import { SalesInvoiceItem } from '../SalesInvoiceItem/SalesInvoiceItem';

/** A sales invoice read through the bridge, as the POS and print do; /books forms use models/invoices. */
export class SalesInvoice extends Invoice {
  items?: SalesInvoiceItem[];
}
