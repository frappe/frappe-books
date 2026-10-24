import { FiltersMap } from 'fyo/model/types';
import type { Filter } from 'src/frappe/api';
import { FrappeDoc } from 'src/frappe/document';
import { getModel, toSchemaName } from 'src/frappe/registry';

/** A Books Payment Entry Reference row: an invoice the payment settles. */
export class PaymentEntryReference extends FrappeDoc {
  static override presentation = {
    label: 'Payment Entry Reference',
    fields: {
      reference_doctype: {
        options: [
          { value: 'Books Sales Invoice', label: 'Sales Invoice' },
          { value: 'Books Purchase Invoice', label: 'Purchase Invoice' },
        ],
      },
      reference_name: { create: false },
    },
    mobileTableFields: [
      'reference_name',
      'reference_doctype',
      'outstanding_amount',
      'allocated_amount',
    ],
    mobileLabelledFields: ['outstanding_amount', 'allocated_amount'],
  };
  static override calculatedFields = ['total_amount', 'outstanding_amount'];
  // A new invoice's total and what it owes, which the server reads.
  static override refills = {
    reference_doctype: [
      'total_amount',
      'outstanding_amount',
      'allocated_amount',
    ],
    reference_name: ['total_amount', 'outstanding_amount', 'allocated_amount'],
  };

  static filters: FiltersMap = {
    reference_name: (doc) => {
      const precision = doc.fyo.singles.SystemSettings?.internal_precision;
      const zero = '0.' + '0'.repeat(precision ?? 11);
      const filters: Filter[] = [
        ['outstanding_amount', '!=', zero],
        ['docstatus', '=', 1],
      ];
      const party = doc.parentdoc?.party as string | undefined;
      const invoice = toSchemaName(String(doc.reference_doctype ?? ''));
      const partyField = invoice && getModel(invoice)?.partyField;
      return party && partyField
        ? [...filters, [partyField, '=', party]]
        : filters;
    },
  };
}
