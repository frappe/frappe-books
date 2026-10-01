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
      reference_name: { create: false },
    },
  };
  // A new invoice's outstanding amount, as Books formulas recalculated it.
  static override refills = { reference_name: ['amount'] };

  static filters: FiltersMap = {
    reference_name: (doc) => {
      const precision = doc.fyo.singles.SystemSettings?.internal_precision;
      const zero = '0.' + '0'.repeat(precision ?? 11);
      const filters = {
        outstanding_amount: ['!=', zero],
        submitted: true,
        cancelled: false,
      };
      const party = doc.parentdoc?.party as string | undefined;
      return party ? { ...filters, party } : filters;
    },
  };
}
