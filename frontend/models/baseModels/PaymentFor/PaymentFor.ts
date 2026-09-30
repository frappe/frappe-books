import { FiltersMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/** A Books Payment For row: an invoice the payment settles. */
export class PaymentFor extends FrappeDoc {
  static override presentation = {
    label: 'Payment For',
    fields: {
      reference_type: {
        options: [
          { value: 'Books Sales Invoice', label: 'Sales' },
          { value: 'Books Purchase Invoice', label: 'Purchase' },
        ],
      },
    },
  };
  // A new invoice's outstanding amount, as Books formulas recalculated it.
  static override refills = { reference_name: ['amount'] };

  // Invoices are still read through the bridge, so this uses their field names.
  static filters: FiltersMap = {
    reference_name: (doc) => {
      const precision = doc.fyo.singles.SystemSettings?.internalPrecision;
      const zero = '0.' + '0'.repeat(precision ?? 11);
      const filters = {
        outstandingAmount: ['!=', zero],
        submitted: true,
        cancelled: false,
      };
      const party = doc.parentdoc?.party as string | undefined;
      return party ? { ...filters, party } : filters;
    },
  };
}
