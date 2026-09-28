import { Fyo } from 'fyo';
import { DocValueMap } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { getMissingMandatoryMessage } from 'fyo/model/helpers';
import { ConflictError } from 'fyo/utils/errors';
import {
  ChangeArg,
  CurrenciesMap,
  DefaultMap,
  FiltersMap,
  FormulaMap,
  HiddenMap,
  RequiredMap,
} from 'fyo/model/types';
import { DEFAULT_CURRENCY } from 'fyo/utils/consts';
import { Transactional } from 'models/Transactional/Transactional';
import { addItem, getNumberSeries } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { DateTime } from 'luxon';
import { Money } from 'pesa';
import { call } from 'src/web/api';
import { FieldTypeEnum, Schema } from 'schemas/types';
import { getIsNullOrUndef } from 'utils';
import { InvoiceItem } from '../InvoiceItem/InvoiceItem';
import { TaxSummary } from '../TaxSummary/TaxSummary';
import { PricingRuleDetail } from '../PricingRuleDetail/PricingRuleDetail';
import { AppliedCouponCodes } from '../AppliedCouponCodes/AppliedCouponCodes';
import { applyPreview } from './preview';

const PREVIEW_DELAY = 300;
const GET_EXCHANGE_RATE = 'frappe_books.currency.get_exchange_rate';
const RATE_SOURCE_FIELDS = ['party', 'priceList', 'currency', 'exchangeRate'];

export abstract class Invoice extends Transactional {
  _previewTimer?: ReturnType<typeof setTimeout>;
  _edits = 0;

  taxes?: TaxSummary[];

  items?: InvoiceItem[];
  coupons?: AppliedCouponCodes[];
  party?: string;
  account?: string;
  currency?: string;
  priceList?: string;
  netTotal?: Money;
  grandTotal?: Money;
  baseGrandTotal?: Money;
  outstandingAmount?: Money;
  exchangeRate?: number;
  setDiscountAmount?: boolean;
  discountAmount?: Money;
  discountPercent?: number;
  loyaltyPoints?: number;
  availableLoyaltyPoints?: number;
  discountAfterTax?: boolean;
  stockNotTransferred?: number;
  loyaltyProgram?: string;
  backReference?: string;
  submitted?: boolean;
  cancelled?: boolean;
  makeAutoPayment?: boolean;
  makeAutoStockTransfer?: boolean;

  isReturned?: boolean;
  returnAgainst?: string;
  isFullyReturned?: boolean;

  pricingRuleDetail?: PricingRuleDetail[];

  get isSales() {
    return (
      this.schemaName === 'SalesInvoice' || this.schemaName == 'SalesQuote'
    );
  }

  get isQuote() {
    return this.schemaName == 'SalesQuote';
  }

  get enableDiscounting() {
    return !!this.fyo.singles?.AccountingSettings?.enableDiscounting;
  }

  get isMultiCurrency() {
    if (!this.currency) {
      return false;
    }

    return this.fyo.singles.SystemSettings!.currency !== this.currency;
  }

  get companyCurrency() {
    return this.fyo.singles.SystemSettings?.currency ?? DEFAULT_CURRENCY;
  }

  get stockTransferSchemaName() {
    return this.isSales
      ? ModelNameEnum.Shipment
      : ModelNameEnum.PurchaseReceipt;
  }

  get stockTransferMapper() {
    return this.isSales ? 'make_shipment' : 'make_purchase_receipt';
  }

  get autoPaymentAccount(): string | null {
    const fieldname = this.isSales
      ? 'salesPaymentAccount'
      : 'purchasePaymentAccount';
    const value = this.fyo.singles.Defaults?.[fieldname];
    if (typeof value === 'string' && value.length) {
      return value;
    }

    return null;
  }

  get autoStockTransferLocation(): string | null {
    const fieldname = this.isSales
      ? 'shipmentLocation'
      : 'purchaseReceiptLocation';
    const value = this.fyo.singles.Defaults?.[fieldname];
    if (typeof value === 'string' && value.length) {
      return value;
    }

    return null;
  }

  get isReturn(): boolean {
    return !!this.returnAgainst;
  }

  /** Row discounts, from the row totals the server calculated. */
  get itemDiscount(): Money {
    const zero = this.fyo.pesa(0);
    const undiscounted = this.discountAfterTax ? 'itemTaxedTotal' : 'amount';
    return (this.items ?? []).reduce(
      (total, row) =>
        total
          .add(row[undiscounted] ?? zero)
          .sub(row.itemDiscountedTotal ?? zero),
      zero
    );
  }

  get totalDiscount(): Money {
    return this.itemDiscount.add(this.discountAmount ?? this.fyo.pesa(0));
  }

  constructor(schema: Schema, data: DocValueMap, fyo: Fyo) {
    super(schema, data, fyo);
    this._setGetCurrencies();
  }

  /** The server's rate on the invoice date, or null (with a warning) when the user must enter it. */
  async getExchangeRate(): Promise<number | null> {
    if (!this.currency || this.currency === this.companyCurrency) {
      return 1.0;
    }

    const exchangeRate = await call<number | null>(GET_EXCHANGE_RATE, {
      from_currency: this.currency,
      to_currency: this.companyCurrency,
      date: this.date ? DateTime.fromJSDate(this.date).toISODate() : null,
    });
    // Warn once, not on every change while the rate stays missing.
    if (exchangeRate === null && this.exchangeRate !== null) {
      await showToast(
        'warning',
        this.fyo
          .t`Could not fetch the exchange rate from ${this.currency} to ${this.companyCurrency}. Enter it at the top of the form.`
      );
    }

    return exchangeRate;
  }

  formulas: FormulaMap = {
    currency: {
      formula: async () => {
        const currency = (await this.fyo.getValue(
          'Party',
          this.party!,
          'currency'
        )) as string;

        if (!getIsNullOrUndef(currency)) {
          return currency;
        }
        return this.fyo.singles.SystemSettings!.currency as string;
      },
      dependsOn: ['party'],
    },
    exchangeRate: {
      formula: async () => {
        if (
          this.currency ===
          (this.fyo.singles.SystemSettings?.currency ?? DEFAULT_CURRENCY)
        ) {
          return 1;
        }

        if (this.exchangeRate && this.exchangeRate !== 1) {
          return this.exchangeRate;
        }

        return await this.getExchangeRate();
      },
      dependsOn: ['party', 'currency'],
    },
  };

  hidden: HiddenMap = {
    makeAutoPayment: () => {
      if (this.submitted) {
        return true;
      }

      return !this.autoPaymentAccount;
    },
    makeAutoStockTransfer: () => {
      if (this.submitted) {
        return true;
      }

      if (!this.fyo.singles.AccountingSettings?.enableInventory) {
        return true;
      }

      return !this.autoStockTransferLocation;
    },
    setDiscountAmount: () => true,
    discountAmount: () => true,
    discountPercent: () => true,
    discountAfterTax: () => !this.enableDiscounting,
    taxes: () => !this.taxes?.length,
    baseGrandTotal: () =>
      this.exchangeRate === 1 || this.baseGrandTotal!.isZero(),
    terms: () => !(this.terms || !(this.isSubmitted || this.isCancelled)),
    attachment: () =>
      !(this.attachment || !(this.isSubmitted || this.isCancelled)),
    backReference: () => !this.backReference,
    quote: () => !this.quote,
    loyaltyProgram: () => !this.loyaltyProgram,
    availableLoyaltyPoints: () => !this.loyaltyProgram || this.isReturn,
    loyaltyPoints: () => !this.redeemLoyaltyPoints || this.isReturn,
    redeemLoyaltyPoints: () => {
      if (!this.loyaltyProgram || this.isReturn) {
        return true;
      }

      return (this.availableLoyaltyPoints ?? 0) <= 0;
    },
    coupons: () =>
      !this.fyo.singles.AccountingSettings?.enableCouponCode ||
      (this.isSubmitted && !this.coupons?.length),
    priceList: () =>
      !this.fyo.singles.AccountingSettings?.enablePriceList ||
      (!this.canEdit && !this.priceList),
    returnAgainst: () =>
      (this.isSubmitted || this.isCancelled) && !this.returnAgainst,
    pricingRuleDetail: () =>
      !this.fyo.singles.AccountingSettings?.enablePricingRule ||
      !this.pricingRuleDetail?.length,
  };

  required: RequiredMap = {
    exchangeRate: () => this.isMultiCurrency,
  };

  static defaults: DefaultMap = {
    // Mirror the server's defaults, as the client always sends check boxes.
    makeAutoPayment: (doc) =>
      doc instanceof Invoice && !!doc.autoPaymentAccount,
    makeAutoStockTransfer: (doc) =>
      !!doc.fyo.singles.AccountingSettings?.enableInventory &&
      doc instanceof Invoice &&
      !!doc.autoStockTransferLocation,
    numberSeries: (doc) => getNumberSeries(doc.schemaName, doc.fyo),
    // Mirrors the server's terms for a new document; quotes are sales too.
    terms: (doc) => {
      const defaults = doc.fyo.singles.Defaults;
      if ((doc as Invoice).isSales) {
        return defaults?.salesInvoiceTerms ?? '';
      }

      return defaults?.purchaseInvoiceTerms ?? '';
    },
  };

  static filters: FiltersMap = {
    party: (doc: Doc) => ({
      role: ['in', [doc.isSales ? 'Customer' : 'Supplier', 'Both']],
    }),
    account: (doc: Doc) => ({
      isGroup: false,
      accountType: doc.isSales ? 'Receivable' : 'Payable',
    }),
    numberSeries: (doc: Doc) => ({ referenceType: doc.schemaName }),
    priceList: (doc: Doc) => ({
      isEnabled: true,
      ...(doc.isSales ? { isSales: true } : { isPurchase: true }),
    }),
  };

  static createFilters: FiltersMap = {
    party: (doc: Doc) => ({
      role: doc.isSales ? 'Customer' : 'Supplier',
    }),
  };

  getCurrencies: CurrenciesMap = {
    baseGrandTotal: () => this.companyCurrency,
    outstandingAmount: () => this.companyCurrency,
  };
  _getCurrency() {
    if (this.exchangeRate === 1) {
      return this.companyCurrency;
    }

    return this.currency ?? DEFAULT_CURRENCY;
  }

  _setGetCurrencies() {
    const currencyFields = this.schema.fields.filter(
      ({ fieldtype }) => fieldtype === FieldTypeEnum.Currency
    );

    for (const { fieldname } of currencyFields) {
      this.getCurrencies[fieldname] ??= this._getCurrency.bind(this);
    }
  }

  /** Previews first when values the server fills, like a new row's account, are still missing. */
  async beforeSync(): Promise<void> {
    await super.beforeSync();
    clearTimeout(this._previewTimer);
    if (this.hasMissingValues) {
      await this.preview();
    }
  }

  get hasMissingValues(): boolean {
    return [this, ...(this.items ?? [])].some(
      (doc) => !!getMissingMandatoryMessage(doc)
    );
  }

  /** Counts edits as they start, so a preview sent before one is dropped. */
  override async _applyChange(
    fieldname: string,
    retriggerChildDocApplyChange?: boolean
  ) {
    this._edits += 1;
    if (fieldname === 'party') {
      // The server's preview sets the new party's account.
      this.account = undefined;
    }
    return await super._applyChange(fieldname, retriggerChildDocApplyChange);
  }

  async change({ changed }: ChangeArg) {
    if (changed && RATE_SOURCE_FIELDS.includes(changed)) {
      this.clearStandardRates();
    }

    this.schedulePreview();
  }

  /** Previews once edits pause, so totals follow the user without a request per keystroke. */
  schedulePreview() {
    clearTimeout(this._previewTimer);
    if (!this.canEdit || !this.dirty) {
      return;
    }

    this._previewTimer = setTimeout(() => {
      this.preview().catch(showPreviewError);
    }, PREVIEW_DELAY);
  }

  /** Show the server's pricing and totals for the unsaved values; dropped if they changed meanwhile. */
  async preview() {
    clearTimeout(this._previewTimer);
    if (!this.canEdit) {
      return;
    }

    const edits = this._edits;
    // A saved invoice sends its `modified`, which the server checks is current.
    const sent = this.getValidDict(false, true);
    const previewed = await this._fetchPreview(sent);
    if (previewed && edits === this._edits && this.dirty) {
      applyPreview(this, sent, previewed);
      // Computed values are not sent, so the preview has none.
      await this._setComputedValuesFromFormulas();
    }
  }

  /** The server's preview, or none for a draft changed elsewhere, which only its save reports. */
  async _fetchPreview(sent: DocValueMap): Promise<DocValueMap | undefined> {
    try {
      return await this.fyo.db.preview(
        this.schemaName,
        sent,
        this.notInserted ? undefined : this.name
      );
    } catch (error) {
      if (error instanceof ConflictError) {
        return;
      }

      throw error;
    }
  }

  /** Let the server price rows again, from the current party, price list and currency. */
  clearStandardRates() {
    for (const row of this.items ?? []) {
      if (!row.isFreeItem && !row.isManualRate) {
        row.clearStandardRate();
      }
    }
  }

  async addItem(name: string, quantity?: number) {
    return await addItem(name, this, quantity);
  }
}

async function showPreviewError(error: unknown) {
  await showToast(
    'error',
    error instanceof Error ? error.message : String(error)
  );
}

async function showToast(type: 'error' | 'warning', message: string) {
  const { showToast } = await import('src/utils/interactive');
  showToast({ type, message });
}
