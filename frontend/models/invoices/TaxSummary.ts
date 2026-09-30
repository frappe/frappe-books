import { Fyo } from 'fyo';
import type { DocValueMap } from 'fyo/core/types';
import { CurrenciesMap } from 'fyo/model/types';
import type { Schema } from 'schemas/types';
import { FrappeDoc } from 'src/frappe/document';
import type { Invoice } from './Invoice';
import { setCurrencies } from './Invoice';

/** A tax the server totals for an invoice, shown in the invoice's currency. */
export class TaxSummary extends FrappeDoc {
  static override presentation = {
    label: 'Tax Summary',
    noCreate: ['account', 'from_account'],
  };

  parentdoc?: Invoice;
  getCurrencies: CurrenciesMap = {};

  constructor(schema: Schema, data: DocValueMap, fyo: Fyo, convert = true) {
    super(schema, data, fyo, convert);
    setCurrencies(this, () => this.parentdoc?.documentCurrency ?? '');
  }
}
