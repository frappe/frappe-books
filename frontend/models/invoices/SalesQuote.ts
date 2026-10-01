import { Fyo } from 'fyo';
import type { Doc } from 'fyo/model/doc';
import { Action, FiltersMap, ListViewSettings } from 'fyo/model/types';
import { getDocStatusListColumn, getQuoteActions } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { INVOICE_FIELDS, INVOICE_QUICK_VIEW_FIELDS, Invoice } from './Invoice';
import { SalesQuoteItem } from './InvoiceItem';
import { TaxSummary } from './TaxSummary';

/** A quote to a customer or a lead; its Type names the doctype of its party. */
export class SalesQuote extends Invoice {
  static override doctype = 'Books Sales Quote';
  static override presentation = {
    label: 'Quote',
    nameField: { label: 'Invoice No', hidden: true },
    fields: {
      ...INVOICE_FIELDS,
      reference_type: {
        options: [
          { value: 'Books Party', label: 'Party' },
          { value: 'Books Lead', label: 'Lead' },
        ],
      },
    },
    quickViewFields: [...INVOICE_QUICK_VIEW_FIELDS, 'reference_type'],
  };
  static override rowModels = { items: SalesQuoteItem, taxes: TaxSummary };

  // A quote's party may be a lead, so it is not filtered by role.
  static override filters: FiltersMap = {
    number_series: (doc: Doc) => ({ reference_type: doc.schemaName }),
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'party',
        'date',
        'base_grand_total',
      ],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return getQuoteActions(fyo, ModelNameEnum.SalesQuote);
  }
}
