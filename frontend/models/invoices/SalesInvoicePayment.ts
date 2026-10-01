import { FrappeDoc } from 'src/frappe/document';

/** A Books Sales Invoice Payment row: a payment the POS takes. */
export class SalesInvoicePayment extends FrappeDoc {
  static override presentation = { label: 'Sales Invoice Payment' };
}
