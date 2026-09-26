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
import { validateBatch } from 'models/inventory/helpers';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { FieldTypeEnum, Schema } from 'schemas/types';
import { getIsNullOrUndef, safeParseFloat } from 'utils';
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

  constructor(schema: Schema, data: DocValueMap, fyo: Fyo) {
    super(schema, data, fyo);
    this._setGetCurrencies();
  }

  async validate() {
    await super.validate();
    if (!this.isQuote) {
      await validateBatch(this);
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

  async getExchangeRate() {
    if (!this.currency) {
      return 1.0;
    }

    const currency = await this.fyo.getValue(
      ModelNameEnum.SystemSettings,
      'currency'
    );
    if (this.currency === currency) {
      return 1.0;
    }
    const exchangeRate = await getExchangeRate({
      fromCurrency: this.currency,
      toCurrency: currency as string,
    });

    return safeParseFloat(exchangeRate.toFixed(2));
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
    loyaltyProgram: {
      formula: async () => {
        const partyDoc = await this.fyo.doc.getDoc(
          ModelNameEnum.Party,
          this.party
        );
        const loyaltyProgramName = partyDoc?.loyaltyProgram as string;

        if (!loyaltyProgramName) {
          return '';
        }

        return loyaltyProgramName;
      },
      dependsOn: ['party', 'name'],
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
    stockNotTransferred: {
      formula: async () => {
        if (this.submitted) {
          return;
        }
        if (this.isReturn) {
          const sinvreturnedDoc = (await this.fyo.doc.getDoc(
            this.schemaName,
            this.returnAgainst
          )) as Invoice;

          if (sinvreturnedDoc.stockNotTransferred === 0) {
            return this.getStockNotTransferred();
          } else {
            return 0;
          }
        }

        return this.getStockNotTransferred();
      },
      dependsOn: ['items'],
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

  getStockNotTransferred() {
    return (this.items ?? []).reduce(
      (acc, item) => (item.stockNotTransferred ?? 0) + acc,
      0
    );
  }

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

  async getStockTransfer(isAuto = false): Promise<StockTransfer | null> {
    if (!this.isSubmitted) {
      return null;
    }

    let linkedEntries;

    if (this.returnAgainst) {
      const original = await this.fyo.doc.getDoc(
        this.schemaName,
        this.returnAgainst
      );

      linkedEntries = await getLinkedEntries(original);
    }

    const itemVisibility = await getItemVisibility(this.fyo);

    if (!this.stockNotTransferred && itemVisibility === 'Inventory Items') {
      return null;
    }

    const schemaName = this.stockTransferSchemaName;
    const defaults = (this.fyo.singles.Defaults as Defaults) ?? {};
    let terms;
    let numberSeries;

    if (this.isSales) {
      terms = defaults.shipmentTerms ?? '';
      numberSeries = defaults.shipmentNumberSeries ?? undefined;
    } else {
      terms = defaults.purchaseReceiptTerms ?? '';
      numberSeries = defaults.purchaseReceiptNumberSeries ?? undefined;
    }

    const data = {
      party: this.party,
      date: new Date().toISOString(),
      terms,
      numberSeries,
      backReference: this.name,
      returnAgainst: linkedEntries?.[schemaName]?.[0] ?? '',
    };

    let location = this.autoStockTransferLocation;
    if (!location) {
      location = this.fyo.singles.InventorySettings?.defaultLocation ?? null;
    }

    if (isAuto && !location) {
      return null;
    }

    const transfer = this.fyo.doc.getNewDoc(schemaName, data) as StockTransfer;

    for (const row of this.items ?? []) {
      if (!row.item) {
        continue;
      }

      const itemDoc = (await row.loadAndGetLink('item')) as Item;
      if (isAuto && (itemDoc.hasBatch || itemDoc.hasSerialNumber)) {
        continue;
      }

      const isFreeItem = row.isFreeItem ?? false;
      if (isFreeItem) {
        await transfer.append('items', {
          item: row.item,
          quantity: row.quantity,
          location,
          rate: this.fyo.pesa(0),
          batch: row.batch || null,
          description: row.description,
          hsnCode: row.hsnCode,
          isFreeItem,
        });
        continue;
      }

      let quantity;
      if (itemDoc.trackItem) {
        quantity = row.stockNotTransferred;
      } else {
        quantity = row.quantity;
      }

      const item = row.item;
      const batch = row.batch || null;
      const description = row.description;
      const hsnCode = row.hsnCode;
      let rate = row.rate as Money;

      if (this.exchangeRate && this.exchangeRate > 1) {
        rate = rate.mul(this.exchangeRate);
      }

      if (!quantity && itemVisibility === 'Inventory Items') {
        continue;
      }

      if (isAuto) {
        const stock =
          (await this.fyo.db.getStockQuantity(
            item,
            location!,
            undefined,
            data.date
          )) ?? 0;

        if (stock < (quantity as number)) {
          continue;
        }
      }

      await transfer.append('items', {
        item,
        quantity,
        location,
        rate,
        batch,
        description,
        hsnCode,
      });
    }

    if (!transfer.items?.length) {
      return null;
    }

    return transfer;
  }

  async beforeSync(): Promise<void> {
    await super.beforeSync();
    clearTimeout(this._previewTimer);
  }

  async change({ changed }: ChangeArg) {
    if (changed && RATE_SOURCE_FIELDS.includes(changed)) {
      this.clearStandardRates();
    }

    this.schedulePreview();
  }

  /** Previews once edits pause, so totals follow the user without a request per keystroke. */
  schedulePreview() {
    this._edits += 1;
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
  const { showToast } = await import('src/utils/interactive');
  showToast({
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
  });
}
