import { Fyo, t } from 'fyo';
import type { DocValueMap } from 'fyo/core/types';
import { CurrenciesMap, ReadOnlyMap } from 'fyo/model/types';
import { DEFAULT_CURRENCY } from 'fyo/utils/consts';
import type { Money } from 'pesa';
import type { Schema } from 'schemas/types';
import type { ChangeArg } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import { isAccessoryMode } from 'src/frappe/mode';
import { withoutCreate } from 'src/frappe/schema';
import { call } from 'src/web/api';
import type { Invoice } from './Invoice';
import { setCurrencies } from './Invoice';

const GET_TAX_RATE = 'erpnext.controllers.accounts_controller.get_tax_rate';

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
  static override getRowTitle = (number: number) => t`Tax row ${number}`;
  // A new type or rate is the server's to work out the amount for.
  static override refills = {
    charge_type: ['tax_amount', 'total'],
    rate: ['tax_amount', 'total'],
    tax_amount: ['total'],
  };

  parentdoc?: Invoice;
  charge_type?: string;
  account_head?: string;
  description?: string;
  rate?: number;
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

  override async change(arg: ChangeArg) {
    if (arg.changed === 'account_head' && isAccessoryMode()) {
      await this.fillFromAccount();
    }

    await super.change(arg);
  }

  /**
   * As Desk's form: ERPNext requires a description, which a new account head
   * fills with its name; its tax rate, if it has one, fills the rate of a
   * charge that is not Actual.
   */
  async fillFromAccount() {
    if (!this.account_head) {
      return;
    }

    const account = await call<{ tax_rate?: number; account_name?: string }>(
      GET_TAX_RATE,
      { account_head: this.account_head }
    );
    this.description = account?.account_name ?? this.account_head;
    if (account?.tax_rate && !this.isActual) {
      this.rate = account.tax_rate;
    }
  }

  get isActual(): boolean {
    return this.charge_type === 'Actual';
  }

  // Only an Actual charge takes the amount the user enters.
  readOnly: ReadOnlyMap = { tax_amount: () => !this.isActual };
}
