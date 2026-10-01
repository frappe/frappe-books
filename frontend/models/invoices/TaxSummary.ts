import { Fyo } from 'fyo';
import type { DocValueMap } from 'fyo/core/types';
import { CurrenciesMap } from 'fyo/model/types';
import { DEFAULT_CURRENCY } from 'fyo/utils/consts';
import type { Money } from 'pesa';
import type { Schema } from 'schemas/types';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import type { Invoice } from './Invoice';
import { setCurrencies } from './Invoice';

/** A tax the server totals for an invoice or a payment, shown in the invoice's currency. */
export class TaxSummary extends FrappeDoc {
  static override presentation = {
    label: 'Tax Summary',
    fields: withoutCreate(['account', 'from_account']),
  };

  parentdoc?: Invoice;
  amount?: Money;
  getCurrencies: CurrenciesMap = {};

  constructor(schema: Schema, data: DocValueMap, fyo: Fyo) {
    super(schema, data, fyo);
    setCurrencies(this, () => this.currency);
  }

  /** A payment's taxes are in the company currency. */
  get currency(): string {
    return (
      this.parentdoc?.documentCurrency ??
      this.fyo.singles.SystemSettings?.currency ??
      DEFAULT_CURRENCY
    );
  }
}
