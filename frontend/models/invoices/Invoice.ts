import { Fyo } from 'fyo';
import type { DocValueMap } from 'fyo/core/types';
import {
  ChangeArg,
  CurrenciesMap,
  FilterFunction,
  FiltersMap,
  HiddenMap,
  RequiredMap,
} from 'fyo/model/types';
import { DEFAULT_CURRENCY } from 'fyo/utils/consts';
import { addItem } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import type { Money } from 'pesa';
import type { Field, Schema } from 'schemas/types';
import { FrappeDoc, type FrappeValueOptions } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import type { InvoiceItem } from './InvoiceItem';
import type { TaxesAndCharges } from './TaxesAndCharges';

// A new rate for rows priced by the server follows these and the party.
const RATE_SOURCE_FIELDS = [
  'posting_date',
  'transaction_date',
  'selling_price_list',
  'buying_price_list',
  'currency',
  'conversion_rate',
];
/** Invoice and quote fields: links that offer no Create, and items edited in the row editor. */
export const INVOICE_FIELDS = {
  ...withoutCreate([
    'selling_price_list',
    'buying_price_list',
    'currency',
    'return_against',
    'loyalty_program',
    'coupon_code',
  ]),
  items: { edit: true },
  taxes: { emptyMessage: 'No taxes. Pick a template or add a row.' },
};

/**
 * An invoice or quote served by Frappe. Its controller fills defaults,
 * prices, taxes and totals; the `preview` shows them while the user edits.
 */
export abstract class Invoice extends FrappeDoc {
  static override previewMethod = 'preview';
  static override calculatedFields = ['total_taxes_and_charges', 'grand_total'];
  static override serverDefaults = [
    'make_auto_payment',
    'make_auto_stock_transfer',
  ];
  // The exchange rate is the one on the invoice date.
  static override refills: Record<string, string[]> = {
    posting_date: ['conversion_rate'],
  };
  static override partyField: string;
  /** The field of the party's ledger account; a quote has none. */
  static partyAccountField?: string;

  items?: InvoiceItem[];
  posting_date?: Date;
  posting_time?: string;
  debit_to?: string;
  credit_to?: string;
  currency?: string;
  conversion_rate?: number;
  selling_price_list?: string;
  buying_price_list?: string;
  taxes_and_charges?: string;
  net_total?: Money;
  total_taxes_and_charges?: Money;
  grand_total?: Money;
  base_grand_total?: Money;
  outstanding_amount?: Money;
  taxes?: TaxesAndCharges[];
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
    return [ModelNameEnum.SalesInvoice, ModelNameEnum.Quotation].includes(
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

  /** The party's ledger account, which the server fills from the party. */
  get partyAccount(): string | undefined {
    const { partyAccountField } = this.constructor as typeof Invoice;
    return partyAccountField ? (this[partyAccountField] as string) : undefined;
  }

  /** Amounts are in the party's currency unless it is the company's. */
  get documentCurrency(): string {
    if (this.conversion_rate === 1) {
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

  /** The payment a submit makes: a sale's receivable is paid into the payment account, a purchase's payable out of it. */
  override get submitNote(): string | undefined {
    if (!this.make_auto_payment) {
      return undefined;
    }

    const amount = this.fyo.format(this.outstanding_amount, 'Currency');
    // A Books User does not see the accounts.
    const account = this.partyAccount;
    if (!account) {
      return this.fyo.t`Payment of ${amount} will be made on Submit.`;
    }

    const [from = '', to = ''] = this.isSales
      ? [account, this.autoPaymentAccount]
      : [this.autoPaymentAccount, account];
    return this.fyo
      .t`Payment of ${amount} will be made from account "${from}" to account "${to}" on Submit.`;
  }

  get autoStockTransferLocation(): string | undefined {
    const fieldname = this.isSales
      ? 'delivery_note_location'
      : 'purchase_receipt_location';
    return (this.fyo.singles.Defaults?.[fieldname] as string) || undefined;
  }

  get stockTransferSchemaName(): string {
    return this.isSales
      ? ModelNameEnum.DeliveryNote
      : ModelNameEnum.PurchaseReceipt;
  }

  get stockTransferMapper(): string {
    return this.isSales ? 'make_delivery_note' : 'make_purchase_receipt';
  }

  /** Whether a submitted invoice has tracked stock no transfer has moved yet. */
  get hasStockToTransfer(): boolean {
    return false;
  }

  get priceList(): string | undefined {
    return this.isSales ? this.selling_price_list : this.buying_price_list;
  }

  // Fields of features turned off in the settings. The DocType's depends_on hides the rest.
  hidden: HiddenMap = {
    discount_after_tax: () =>
      !this.fyo.singles.AccountingSettings?.enable_discounting,
    selling_price_list: () => this.isPriceListHidden,
    buying_price_list: () => this.isPriceListHidden,
    // A finished document names its template in the Taxes section instead.
    taxes_and_charges: () => this.submitted,
  };

  /** A finished document's Taxes section names the template its rows came from. */
  override getSectionDescription(section: string): string | undefined {
    const field = this.fieldMap.taxes_and_charges;
    if (
      !this.submitted ||
      !this.taxes_and_charges ||
      field?.section !== section
    ) {
      return undefined;
    }

    return `${field.label}: ${this.taxes_and_charges}`;
  }

  get isPriceListHidden(): boolean {
    return (
      !this.fyo.singles.AccountingSettings?.enable_price_list ||
      (!this.canEdit && !this.priceList)
    );
  }

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
    conversion_rate: () => this.isMultiCurrency,
  };

  static override filters: FiltersMap = {
    debit_to: getPartyAccountFilter('Receivable'),
    credit_to: getPartyAccountFilter('Payable'),
    naming_series: (doc: FrappeDoc) => [
      ['reference_type', '=', doc.schemaName],
    ],
    selling_price_list: getPriceListFilter('selling'),
    buying_price_list: getPriceListFilter('buying'),
    taxes_and_charges: () => [['disabled', '=', 0]],
  };

  override async change(arg: ChangeArg) {
    const { partyField, partyAccountField } = this
      .constructor as typeof Invoice;
    const isPartyChange = arg.changed === partyField;
    if (isPartyChange) {
      // The server fills these from the party.
      const fields = ['currency', 'conversion_rate'];
      this.leaveToServer(
        partyAccountField ? [partyAccountField, ...fields] : fields
      );
    }

    if (isPartyChange || RATE_SOURCE_FIELDS.includes(arg.changed ?? '')) {
      this.repriceRows();
    }

    if (arg.changed === 'taxes_and_charges' && this.taxes_and_charges) {
      // A new template replaces the rows, as the server fills them from it.
      this.taxes = [];
    }

    await super.change(arg);
  }

  /** A cleared template goes empty, not null, as the server starts a new document with the default one. */
  override _getFrappeValue(field: Field, options: FrappeValueOptions) {
    if (
      field.fieldname === 'taxes_and_charges' &&
      this.taxes_and_charges === ''
    ) {
      return '';
    }

    return super._getFrappeValue(field, options);
  }

  /** Lets the server price rows again, except free rows and rates the user set. */
  repriceRows() {
    for (const row of this.items ?? []) {
      if (!row.is_free_item && !row.is_manual_rate) {
        row.leaveToServer(['price_list_rate']);
      }
    }
  }

  override applyPreview(previewed: DocValueMap) {
    super.applyPreview(previewed);
    this.warnOfMissingRate();
  }

  /** Warns once per currency when the server has no rate, which the user then enters. */
  warnOfMissingRate() {
    if (!this.isMultiCurrency || this.conversion_rate) {
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

function getPartyAccountFilter(accountType: string): FilterFunction {
  return () => [
    ['is_group', '=', 0],
    ['account_type', '=', accountType],
  ];
}

function getPriceListFilter(side: 'selling' | 'buying'): FilterFunction {
  return () => [
    ['enabled', '=', 1],
    [side, '=', 1],
  ];
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
