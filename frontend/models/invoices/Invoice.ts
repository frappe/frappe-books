import { Fyo } from 'fyo';
import type { DocValueMap } from 'fyo/core/types';
import {
  ChangeArg,
  CurrenciesMap,
  FiltersMap,
  HiddenMap,
  RequiredMap,
} from 'fyo/model/types';
import { DEFAULT_CURRENCY } from 'fyo/utils/consts';
import { addItem } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import type { Money } from 'pesa';
import type { Schema } from 'schemas/types';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import type { InvoiceItem } from './InvoiceItem';
import type { TaxSummary } from './TaxSummary';

// A new rate for rows priced by the server follows these.
const RATE_SOURCE_FIELDS = [
  'party',
  'date',
  'price_list',
  'currency',
  'exchange_rate',
];
// The server fills these from the party.
const PARTY_FIELDS = ['account', 'currency', 'exchange_rate'];
/** Invoice and quote fields: links that offer no Create, and items edited in the row editor. */
export const INVOICE_FIELDS = {
  ...withoutCreate([
    'price_list',
    'currency',
    'back_reference',
    'return_against',
    'quote',
    'loyalty_program',
  ]),
  items: { edit: true },
};

/**
 * An invoice or quote served by Frappe. Its controller fills defaults,
 * prices, taxes and totals; the `preview` shows them while the user edits.
 */
export abstract class Invoice extends FrappeDoc {
  static override previewMethod = 'preview';
  static override serverDefaults = [
    'make_auto_payment',
    'make_auto_stock_transfer',
  ];
  // The exchange rate is the one on the invoice date.
  static override refills = { party: PARTY_FIELDS, date: ['exchange_rate'] };

  items?: InvoiceItem[];
  date?: Date;
  party?: string;
  account?: string;
  currency?: string;
  exchange_rate?: number;
  price_list?: string;
  net_total?: Money;
  total_discount?: Money;
  loyalty_points_amount?: Money;
  grand_total?: Money;
  base_grand_total?: Money;
  outstanding_amount?: Money;
  taxes?: TaxSummary[];
  loyalty_points?: number;
  redeem_loyalty_points?: boolean;
  return_against?: string;
  make_auto_payment?: boolean;
  is_pos?: boolean;
  _missingRateCurrency?: string;

  getCurrencies: CurrenciesMap = {};

  constructor(schema: Schema, data: DocValueMap, fyo: Fyo) {
    super(schema, data, fyo);
    setCurrencies(this, () => this.documentCurrency);
    this.getCurrencies.base_grand_total = () => this.companyCurrency;
    this.getCurrencies.outstanding_amount = () => this.companyCurrency;
  }

  /** Invoices post ledger entries, which the form offers to show after submit. */
  get isTransactional(): boolean {
    return true;
  }

  get isSales(): boolean {
    return [ModelNameEnum.SalesInvoice, ModelNameEnum.SalesQuote].includes(
      this.schemaName as ModelNameEnum
    );
  }

  get isReturn(): boolean {
    return !!this.return_against;
  }

  get companyCurrency(): string {
    return this.fyo.singles.SystemSettings?.currency ?? DEFAULT_CURRENCY;
  }

  get isMultiCurrency(): boolean {
    return !!this.currency && this.currency !== this.companyCurrency;
  }

  /** Amounts are in the party's currency unless it is the company's. */
  get documentCurrency(): string {
    if (this.exchange_rate === 1) {
      return this.companyCurrency;
    }

    return this.currency ?? DEFAULT_CURRENCY;
  }

  get autoPaymentAccount(): string | undefined {
    const fieldname = this.isSales
      ? 'sales_payment_account'
      : 'purchase_payment_account';
    return (this.fyo.singles.Defaults?.[fieldname] as string) || undefined;
  }

  get autoStockTransferLocation(): string | undefined {
    const fieldname = this.isSales
      ? 'shipment_location'
      : 'purchase_receipt_location';
    return (this.fyo.singles.Defaults?.[fieldname] as string) || undefined;
  }

  get stockTransferSchemaName(): string {
    return this.isSales
      ? ModelNameEnum.Shipment
      : ModelNameEnum.PurchaseReceipt;
  }

  get stockTransferMapper(): string {
    return this.isSales ? 'make_shipment' : 'make_purchase_receipt';
  }

  // Fields of features turned off in the settings. The DocType's depends_on hides the rest.
  hidden: HiddenMap = {
    discount_after_tax: () =>
      !this.fyo.singles.AccountingSettings?.enable_discounting,
    price_list: () =>
      !this.fyo.singles.AccountingSettings?.enable_price_list ||
      (!this.canEdit && !this.price_list),
  };

  /** Rules of the fields invoices have and quotes lack: follow-ups on submit, and returns. */
  get postingHidden(): HiddenMap {
    return {
      make_auto_payment: () => !this.autoPaymentAccount,
      make_auto_stock_transfer: () =>
        !this.fyo.singles.AccountingSettings?.enable_inventory ||
        !this.autoStockTransferLocation,
      return_against: () =>
        !this.fyo.singles.AccountingSettings?.enable_invoice_returns &&
        !this.return_against,
    };
  }

  // The server refuses a missing rate too; asked for here to show it at the field.
  required: RequiredMap = {
    exchange_rate: () => this.isMultiCurrency,
  };

  static override filters: FiltersMap = {
    party: (doc: FrappeDoc) => [
      ['role', 'in', [doc.isSales ? 'Customer' : 'Supplier', 'Both']],
    ],
    account: (doc: FrappeDoc) => [
      ['is_group', '=', 0],
      ['account_type', '=', doc.isSales ? 'Receivable' : 'Payable'],
    ],
    number_series: (doc: FrappeDoc) => [['reference_type', '=', doc.schemaName]],
    price_list: (doc: FrappeDoc) => [
      ['is_enabled', '=', 1],
      [doc.isSales ? 'is_sales' : 'is_purchase', '=', 1],
    ],
  };

  static override createFilters: FiltersMap = {
    party: (doc: FrappeDoc) => [['role', '=', doc.isSales ? 'Customer' : 'Supplier']],
  };

  override async change(arg: ChangeArg) {
    if (arg.changed && RATE_SOURCE_FIELDS.includes(arg.changed)) {
      this.repriceRows();
    }

    await super.change(arg);
  }

  /** Lets the server price rows again, except free rows and rates the user set. */
  repriceRows() {
    for (const row of this.items ?? []) {
      if (!row.is_free_item && !row.is_manual_rate) {
        row.leaveToServer(['rate']);
      }
    }
  }

  override applyPreview(previewed: DocValueMap) {
    super.applyPreview(previewed);
    this.warnOfMissingRate();
  }

  /** Warns once per currency when the server has no rate, which the user then enters. */
  warnOfMissingRate() {
    if (!this.isMultiCurrency || this.exchange_rate) {
      this._missingRateCurrency = undefined;
      return;
    }

    if (this._missingRateCurrency === this.currency) {
      return;
    }

    this._missingRateCurrency = this.currency;
    void showWarning(
      this.fyo
        .t`Could not fetch the exchange rate from ${this.currency!} to ${this.companyCurrency}. Enter it at the top of the form.`
    );
  }

  /** Adds a row for the item, or more of it to its row, as a barcode scan does. */
  async addItem(name: string, quantity = 1) {
    await addItem(name, this, quantity);
  }
}

/** Shows a currency field of `doc` in the currency `getCurrency` names. */
export function setCurrencies(doc: FrappeDoc, getCurrency: () => string) {
  for (const { fieldname, fieldtype } of doc.schema.fields) {
    if (fieldtype === 'Currency') {
      doc.getCurrencies[fieldname] = getCurrency;
    }
  }
}

async function showWarning(message: string) {
  const { showToast } = await import('src/utils/interactive');
  showToast({ type: 'warning', message });
}
