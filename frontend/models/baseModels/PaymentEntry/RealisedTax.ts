import { Fyo } from 'fyo';
import type { DocValueMap } from 'fyo/core/types';
import { CurrenciesMap } from 'fyo/model/types';
import { DEFAULT_CURRENCY } from 'fyo/utils/consts';
import { setCurrencies } from 'models/invoices/Invoice';
import type { Money } from 'pesa';
import type { Schema } from 'schemas/types';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';

/** A tax a payment moves from the invoice's tax account to the tax's payment account, in the company currency. */
export class RealisedTax extends FrappeDoc {
  static override presentation = {
    label: 'Realised Tax',
    fields: withoutCreate(['account', 'from_account']),
  };

  amount?: Money;
  getCurrencies: CurrenciesMap = {};

  constructor(schema: Schema, data: DocValueMap, fyo: Fyo) {
    super(schema, data, fyo);
    setCurrencies(
      this,
      () => this.fyo.singles.SystemSettings?.currency ?? DEFAULT_CURRENCY
    );
  }
}
