import { Fyo } from 'fyo';
import type { DocValueMap } from 'fyo/core/types';
import { CurrenciesMap, ReadOnlyMap } from 'fyo/model/types';
import { DEFAULT_CURRENCY } from 'fyo/utils/consts';
import type { Money } from 'pesa';
import type { Schema } from 'schemas/types';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import type { Invoice } from './Invoice';
import { setCurrencies } from './Invoice';

/**
 * A Sales or Purchase Taxes and Charges row of an invoice, a quote or a
 * template. The server works out its amount, except an Actual charge's, and
 * its running total.
 */
export class TaxesAndCharges extends FrappeDoc {
  static override presentation = {
    label: 'Taxes and Charges',
    fields: withoutCreate(['account_head']),
    tableFields: ['charge_type', 'account_head', 'rate', 'tax_amount', 'total'],
    mobileTableFields: ['account_head', 'charge_type', 'rate', 'tax_amount'],
    mobileRowDetail: 'total',
    quickEditFields: [
      'charge_type',
      'account_head',
      'rate',
      'tax_amount',
      'total',
    ],
  };
  static override calculatedFields = ['tax_amount', 'total'];
  // A new type or rate is the server's to work out the amount for.
  static override refills = {
    charge_type: ['tax_amount', 'total'],
    rate: ['tax_amount', 'total'],
    tax_amount: ['total'],
  };

  parentdoc?: Invoice;
  charge_type?: string;
  tax_amount?: Money;
  getCurrencies: CurrenciesMap = {};

  constructor(schema: Schema, data: DocValueMap, fyo: Fyo) {
    super(schema, data, fyo);
    setCurrencies(this, () => this.currency);
  }

  /** The invoice's currency; a template's rows are in the company currency. */
  get currency(): string {
    return (
      this.parentdoc?.documentCurrency ??
      this.fyo.singles.SystemSettings?.currency ??
      DEFAULT_CURRENCY
    );
  }

  get isActual(): boolean {
    return this.charge_type === 'Actual';
  }

  // Only an Actual charge takes the amount the user enters.
  readOnly: ReadOnlyMap = { tax_amount: () => !this.isActual };
}
