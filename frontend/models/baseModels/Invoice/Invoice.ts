import { Fyo } from 'fyo';
import { DocValueMap } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
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
import {
  addItem,
  getExchangeRate,
  getNumberSeries,
  getItemVisibility,
} from 'models/helpers';
import { StockTransfer } from 'models/inventory/StockTransfer';
import { createMissingBatches } from 'models/inventory/helpers';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { FieldTypeEnum, Schema } from 'schemas/types';
import { getIsNullOrUndef } from 'utils';
import { Defaults } from '../Defaults/Defaults';
import { InvoiceItem } from '../InvoiceItem/InvoiceItem';
import { Item } from '../Item/Item';
import { TaxSummary } from '../TaxSummary/TaxSummary';
import { PricingRuleDetail } from '../PricingRuleDetail/PricingRuleDetail';
import { AppliedCouponCodes } from '../AppliedCouponCodes/AppliedCouponCodes';
import { getLinkedEntries } from 'src/utils/doc';
import { applyPreview } from './preview';

const PREVIEW_DELAY = 300;
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

  async validate() {
    await super.validate();
    if (!this.isQuote) {
      await createMissingBatches(this);
    }
  }

  async getPaymentIds() {
    const payments = (await this.fyo.db.getAll('PaymentFor', {
      fields: ['parent'],
      filters: { referenceType: this.schemaName, referenceName: this.name! },
      orderBy: 'name',
    })) as { parent: string }[];

    if (payments.length != 0) {
      return [...new Set(payments.map(({ parent }) => parent))];
    }

    return [];
  }

  /** The fetched rate, or null (with a warning) when the user must enter it. */
  async getExchangeRate(): Promise<number | null> {
    if (!this.currency || this.currency === this.companyCurrency) {
      return 1.0;
    }

    const exchangeRate = await getExchangeRate({
      fromCurrency: this.currency,
      toCurrency: this.companyCurrency,
    });
    // Warn once, not on every change while the rate stays missing.
    if (exchangeRate === undefined && this.exchangeRate !== null) {
      await showToast(
        'warning',
        this.fyo
          .t`Could not fetch the exchange rate from ${this.currency} to ${this.companyCurrency}. Enter it at the top of the form.`
      );
    }

    return exchangeRate ?? null;
  }

  formulas: FormulaMap = {
    account: {
      formula: async () => {
        return (await this.fyo.getValue(
          'Party',
          this.party!,
          'defaultAccount'
        )) as string;
      },
      dependsOn: ['party'],
    },
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
    makeAutoPayment: {
      formula: () => !!this.autoPaymentAccount,
      dependsOn: [],
    },
    makeAutoStockTransfer: {
      formula: () =>
        !!this.fyo.singles.AccountingSettings?.enableInventory &&
        !!this.autoStockTransferLocation,
      dependsOn: [],
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
    coupons: () => this.isSubmitted && !this.coupons?.length,
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
    makeAutoPayment: (doc) =>
      doc instanceof Invoice && !!doc.autoPaymentAccount,
    makeAutoStockTransfer: (doc) =>
      !!doc.fyo.singles.AccountingSettings?.enableInventory &&
      doc instanceof Invoice &&
      !!doc.autoStockTransferLocation,
    numberSeries: (doc) => getNumberSeries(doc.schemaName, doc.fyo),
    terms: (doc) => {
      const defaults = doc.fyo.singles.Defaults;
      if (doc.schemaName === ModelNameEnum.SalesInvoice) {
        return defaults?.salesInvoiceTerms ?? '';
      }

      return defaults?.purchaseInvoiceTerms ?? '';
    },
    date: () => new Date(),
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

  /** A draft Shipment or Purchase Receipt for what this invoice has not transferred yet. */
  async getStockTransfer(): Promise<StockTransfer | null> {
    if (!this.isSubmitted) {
      return null;
    }

    const onlyInventory =
      (await getItemVisibility(this.fyo)) === 'Inventory Items';
    if (!this.stockNotTransferred && onlyInventory) {
      return null;
    }

    const transfer = this.fyo.doc.getNewDoc(
      this.stockTransferSchemaName,
      await this.getStockTransferValues()
    ) as StockTransfer;
    const location =
      this.autoStockTransferLocation ??
      this.fyo.singles.InventorySettings?.defaultLocation ??
      null;
    for (const row of this.items ?? []) {
      const values = await this.getStockTransferRow(row, onlyInventory);
      if (values) {
        await transfer.append('items', { ...values, location });
      }
    }

    return transfer.items?.length ? transfer : null;
  }

  async getStockTransferValues(): Promise<DocValueMap> {
    const defaults = (this.fyo.singles.Defaults as Defaults) ?? {};
    const [terms, numberSeries] = this.isSales
      ? [defaults.shipmentTerms, defaults.shipmentNumberSeries]
      : [defaults.purchaseReceiptTerms, defaults.purchaseReceiptNumberSeries];

    return {
      party: this.party,
      date: new Date().toISOString(),
      terms: terms ?? '',
      numberSeries: numberSeries ?? undefined,
      backReference: this.name,
      returnAgainst: await this.getReturnedStockTransfer(),
    };
  }

  /** The original invoice's transfer, which the transfer of a return reverses. */
  async getReturnedStockTransfer(): Promise<string> {
    if (!this.returnAgainst) {
      return '';
    }

    const original = await this.fyo.doc.getDoc(
      this.schemaName,
      this.returnAgainst
    );
    const linkedEntries = await getLinkedEntries(original);
    return linkedEntries[this.stockTransferSchemaName]?.[0] ?? '';
  }

  /** Transfer row values for an invoice row, or null when it has nothing left to transfer. */
  async getStockTransferRow(
    row: InvoiceItem,
    onlyInventory: boolean
  ): Promise<DocValueMap | null> {
    if (!row.item) {
      return null;
    }

    const values = {
      item: row.item,
      batch: row.batch || null,
      description: row.description,
      hsnCode: row.hsnCode,
    };
    if (row.isFreeItem) {
      return {
        ...values,
        quantity: row.quantity,
        rate: this.fyo.pesa(0),
        isFreeItem: true,
      };
    }

    const item = (await row.loadAndGetLink('item')) as Item;
    const quantity = item.trackItem ? row.stockNotTransferred : row.quantity;
    if (!quantity && onlyInventory) {
      return null;
    }

    const rate = (row.rate as Money).mul(this.exchangeRate ?? 1);
    return { ...values, quantity, rate };
  }

  async beforeSync(): Promise<void> {
    await super.beforeSync();
    clearTimeout(this._previewTimer);
  }

  /** Counts edits as they start, so a preview sent before one is dropped. */
  override async _applyChange(
    fieldname: string,
    retriggerChildDocApplyChange?: boolean
  ) {
    this._edits += 1;
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
    const sent = this.getValidDict(true, true);
    const previewed = await this.fyo.db.preview(
      this.schemaName,
      sent,
      this.notInserted ? undefined : this.name
    );
    if (edits === this._edits && this.dirty) {
      applyPreview(this, sent, previewed);
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

  async addItem(name: string) {
    return await addItem(name, this);
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
