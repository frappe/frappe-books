import { Fyo, t } from 'fyo';
import { DocValue, DocValueMap } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import {
  CurrenciesMap,
  ChangeArg,
  FiltersMap,
  FormulaMap,
  HiddenMap,
  ValidationMap,
} from 'fyo/model/types';
import { DEFAULT_CURRENCY } from 'fyo/utils/consts';
import { ValidationError } from 'fyo/utils/errors';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { FieldTypeEnum, Schema } from 'schemas/types';
import { safeParseFloat } from 'utils/index';
import { Invoice } from '../Invoice/Invoice';
import { isPesa } from 'fyo/utils';
import { PricingRule } from '../PricingRule/PricingRule';
import {
  getItemRateFromPriceList,
  getPricingRule,
} from 'models/helpers';
import { SalesInvoice } from '../SalesInvoice/SalesInvoice';
import { getSuggestedBatchName } from 'models/inventory/helpers';
import { getPOSInventory } from 'models/inventory/posStock';
import { QueryFilter } from 'utils/db/types';

export abstract class InvoiceItem extends Doc {
  item?: string;
  account?: string;
  amount?: Money;
  parentdoc?: Invoice;
  rate?: Money;

  description?: string;
  hsnCode?: number;

  unit?: string;
  transferUnit?: string;
  quantity?: number;
  transferQuantity?: number;
  qty?: number;
  unitConversionFactor?: number;
  batch?: string;
  serialNumber?: string;

  tax?: string;
  stockNotTransferred?: number;

  setItemDiscountAmount?: boolean;
  itemDiscountAmount?: Money;
  isManualRate?: boolean;
  itemDiscountPercent?: number;
  itemDiscountedTotal?: Money;
  itemTaxedTotal?: Money;

  isFreeItem?: boolean;

  get isSales() {
    return (
      this.schemaName === 'SalesInvoiceItem' ||
      this.schemaName === 'SalesQuoteItem'
    );
  }

  get date() {
    return this.parentdoc?.date ?? undefined;
  }

  get party() {
    return this.parentdoc?.party ?? undefined;
  }

  get priceList() {
    return this.parentdoc?.priceList ?? undefined;
  }

  get discountAfterTax() {
    return !!this?.parentdoc?.discountAfterTax;
  }

  get enableDiscounting() {
    return !!this.fyo.singles?.AccountingSettings?.enableDiscounting;
  }

  get enableInventory() {
    return !!this.fyo.singles?.AccountingSettings?.enableInventory;
  }

  get currency() {
    return this.parentdoc?.currency ?? DEFAULT_CURRENCY;
  }

  get exchangeRate() {
    return this.parentdoc?.exchangeRate ?? 1;
  }

  get isMultiCurrency() {
    return this.parentdoc?.isMultiCurrency ?? false;
  }

  get isReturn() {
    return !!this.parentdoc?.isReturn;
  }

  get pricingRuleDetail() {
    return this.parentdoc?.pricingRuleDetail;
  }

  constructor(schema: Schema, data: DocValueMap, fyo: Fyo) {
    super(schema, data, fyo);
    this._setGetCurrencies();
  }

  override async change(ch: ChangeArg): Promise<void> {
    await super.change(ch);

    if (ch.changed === 'item') {
      if (!this.isSales && this.item) {
        const hasBatch = await this.fyo.getValue(
          ModelNameEnum.Item,
          this.item,
          'hasBatch'
        );

        if (hasBatch) {
          const batchName = await getSuggestedBatchName(this.fyo, this.item);
          if (batchName) {
            await this.set('batch', batchName);
          }
        }
      }
    }
  }

  override async _applyChange(
    fieldname: string,
    retriggerChildDocApplyChange?: boolean
  ) {
    if (
      ['rate', 'itemTaxedTotal', 'itemDiscountedTotal'].includes(fieldname)
    ) {
      this.isManualRate = true;
    } else if (['item', 'priceList', 'batch'].includes(fieldname)) {
      this.isManualRate = false;
    }
    return super._applyChange(fieldname, retriggerChildDocApplyChange);
  }

  async getTotalTaxRate(): Promise<number> {
    if (!this.tax) {
      return 0;
    }

    const details =
      ((await this.fyo.getValue('Tax', this.tax, 'details')) as Doc[]) ?? [];
    return details.reduce((acc, doc) => {
      return (doc.rate as number) + acc;
    }, 0);
  }

  formulas: FormulaMap = {
    description: {
      formula: async () =>
        (await this.fyo.getValue(
          'Item',
          this.item as string,
          'description'
        )) as string,
      dependsOn: ['item'],
    },
    itemCode: {
      formula: async () =>
        (await this.fyo.getValue(
          'Item',
          this.item as string,
          'itemCode'
        )) as string,
      dependsOn: ['item'],
    },
    rate: {
      formula: async (fieldname) => {
        if (['item', 'priceList', 'batch'].includes(fieldname ?? '')) {
          this.isManualRate = false;
        }
        const isTotalEdit =
          fieldname === 'itemTaxedTotal' ||
          fieldname === 'itemDiscountedTotal';
        if (this.isManualRate && !isTotalEdit) {
          return this.rate;
        }
        const rate = await getItemRate(this);
        if (!isTotalEdit && !rate?.float && this.rate?.float) {
          return this.rate;
        }

        if (
          fieldname !== 'itemTaxedTotal' &&
          fieldname !== 'itemDiscountedTotal'
        ) {
          return rate?.div(this.exchangeRate) ?? this.fyo.pesa(0);
        }

        const quantity = this.quantity ?? 0;
        const itemDiscountPercent = this.itemDiscountPercent ?? 0;
        const itemDiscountAmount =
          this.itemDiscountAmount ?? this.fyo.pesa(0);
        const totalTaxRate = await this.getTotalTaxRate();
        const itemTaxedTotal = this.itemTaxedTotal ?? this.fyo.pesa(0);
        const itemDiscountedTotal =
          this.itemDiscountedTotal ?? this.fyo.pesa(0);
        const isItemTaxedTotal = fieldname === 'itemTaxedTotal';
        const discountAfterTax = this.discountAfterTax;
        const setItemDiscountAmount = !!this.setItemDiscountAmount;

        const rateFromTotals = getRate(
          quantity,
          itemDiscountPercent,
          itemDiscountAmount,
          totalTaxRate,
          itemTaxedTotal,
          itemDiscountedTotal,
          isItemTaxedTotal,
          discountAfterTax,
          setItemDiscountAmount
        );

        return rateFromTotals ?? rate ?? this.fyo.pesa(0);
      },
      dependsOn: [
        'date',
        'priceList',
        'batch',
        'party',
        'exchangeRate',
        'item',
        'quantity',
        'itemTaxedTotal',
        'itemDiscountedTotal',
        'setItemDiscountAmount',
        'pricingRuleDetail',
      ],
    },
    unit: {
      formula: async () =>
        (await this.fyo.getValue(
          'Item',
          this.item as string,
          'unit'
        )) as string,
      dependsOn: ['item'],
    },
    transferUnit: {
      formula: async (fieldname) => {
        if (!this.item) {
          return;
        }
        if (fieldname === 'quantity' || fieldname === 'unit') {
          return this.unit;
        }

        const conversionItems = await this.fyo.db.getAll(
          ModelNameEnum.UOMConversionItem,
          {
            fields: ['uom'],
            filters: { parent: this.item },
          }
        );

        if (!conversionItems.length) {
          return this.unit;
        }

        const validUnits = conversionItems.map((i) => i.uom);
        if (this.transferUnit && validUnits.includes(this.transferUnit)) {
          return this.transferUnit;
        }

        return this.unit;
      },
      dependsOn: ['item', 'unit'],
    },
    transferQuantity: {
      formula: (fieldname) => {
        if (fieldname === 'qty') {
          return this.qty;
        }
        if (fieldname === 'quantity' || this.unit === this.transferUnit) {
          return this.quantity;
        }

        return this.transferQuantity;
      },
      dependsOn: ['item', 'quantity', 'qty'],
    },
    qty: {
      formula: (fieldname) => {
        if (fieldname === 'transferQuantity') {
          return this.transferQuantity;
        }
        if (fieldname === 'quantity' || this.unit === this.transferUnit) {
          return this.quantity;
        }
        return this.transferQuantity;
      },
      dependsOn: ['transferQuantity', 'quantity'],
    },
    quantity: {
      formula: async (fieldname) => {
        if (!this.item) {
          return this.quantity as number;
        }

        const itemDoc = await this.fyo.doc.getDoc(
          ModelNameEnum.Item,
          this.item
        );
        const unitDoc = itemDoc.getLink('uom');

        let quantity: number = this.quantity ?? 1;

        if (this.isReturn && quantity > 0) {
          quantity *= -1;
        }

        if (!this.isReturn && quantity < 0) {
          quantity *= -1;
        }

        if (fieldname === 'transferQuantity') {
          quantity = this.transferQuantity! * this.unitConversionFactor!;
        }

        if (unitDoc?.isWhole) {
          return Math.round(quantity);
        }

        return safeParseFloat(quantity);
      },
      dependsOn: [
        'quantity',
        'transferQuantity',
        'transferUnit',
        'unitConversionFactor',
        'item',
        'isReturn',
      ],
    },
    unitConversionFactor: {
      formula: async () => {
        if (this.unit === this.transferUnit) {
          this.quantity = this.transferQuantity!;
          return 1;
        }

        const conversionItems = await this.fyo.db.getAll(
          ModelNameEnum.UOMConversionItem,
          {
            fields: ['conversionFactor', 'uom'],
            filters: { parent: this.item!, uom: this.transferUnit as string },
          }
        );

        this.quantity =
          (conversionItems[0]?.conversionFactor as number) *
          this.transferQuantity!;

        return safeParseFloat(conversionItems[0]?.conversionFactor ?? 0);
      },
      dependsOn: ['transferUnit', 'qty'],
    },
    account: {
      formula: () => {
        let accountType = 'expenseAccount';
        if (this.isSales) {
          accountType = 'incomeAccount';
        }
        return this.fyo.getValue('Item', this.item as string, accountType);
      },
      dependsOn: ['item'],
    },
    tax: {
      formula: async () => {
        const itemTax = (await this.fyo.getValue(
          'Item',
          this.item as string,
          'tax'
        )) as string;

        if (itemTax) {
          return itemTax;
        }

        const itemGroup = (await this.fyo.getValue(
          'Item',
          this.item as string,
          'itemGroup'
        )) as string;

        if (!itemGroup) {
          return '';
        }

        const itemGroupDoc = await this.fyo.doc.getDoc('ItemGroup', itemGroup);

        return itemGroupDoc?.tax as string;
      },
      dependsOn: ['item'],
    },
    amount: {
      formula: () => (this.rate as Money).mul(this.quantity as number),
      dependsOn: ['item', 'rate', 'quantity'],
    },
    hsnCode: {
      formula: async () =>
        await this.fyo.getValue('Item', this.item as string, 'hsnCode'),
      dependsOn: ['item'],
    },
    itemDiscountedTotal: {
      formula: async () => {
        const totalTaxRate = await this.getTotalTaxRate();
        const rate = this.rate ?? this.fyo.pesa(0);
        const quantity = this.quantity ?? 1;
        const itemDiscountAmount = this.itemDiscountAmount ?? this.fyo.pesa(0);
        const itemDiscountPercent = this.itemDiscountPercent ?? 0;

        if (this.setItemDiscountAmount && this.itemDiscountAmount?.isZero()) {
          return rate.mul(quantity);
        }

        if (!this.setItemDiscountAmount && this.itemDiscountPercent === 0) {
          return rate.mul(quantity);
        }

        if (!this.discountAfterTax) {
          return getDiscountedTotalBeforeTaxation(
            rate,
            quantity,
            itemDiscountAmount,
            itemDiscountPercent,
            !!this.setItemDiscountAmount
          );
        }

        return getDiscountedTotalAfterTaxation(
          totalTaxRate,
          rate,
          quantity,
          itemDiscountAmount,
          itemDiscountPercent,
          !!this.setItemDiscountAmount
        );
      },
      dependsOn: [
        'itemDiscountAmount',
        'itemDiscountPercent',
        'itemTaxedTotal',
        'setItemDiscountAmount',
        'tax',
        'rate',
        'quantity',
        'item',
      ],
    },
    itemTaxedTotal: {
      formula: async () => {
        const totalTaxRate = await this.getTotalTaxRate();
        const rate = this.rate ?? this.fyo.pesa(0);
        const quantity = this.quantity ?? 1;
        const itemDiscountAmount = this.itemDiscountAmount ?? this.fyo.pesa(0);
        const itemDiscountPercent = this.itemDiscountPercent ?? 0;

        if (!this.discountAfterTax) {
          return getTaxedTotalAfterDiscounting(
            totalTaxRate,
            rate,
            quantity,
            itemDiscountAmount,
            itemDiscountPercent,
            !!this.setItemDiscountAmount
          );
        }

        return getTaxedTotalBeforeDiscounting(totalTaxRate, rate, quantity);
      },
      dependsOn: ['rate', 'quantity', 'item'],
    },
    setItemDiscountAmount: {
      formula: async () => {
        if (!this.fyo.singles.AccountingSettings?.enablePricingRule) {
          return this.setItemDiscountAmount;
        }

        const hasPricingRule = this.parentdoc?.pricingRuleDetail?.some(
          (rule) => rule.referenceItem === this.item
        );

        if (!hasPricingRule && (this.itemDiscountAmount as Money).isZero()) {
          return false;
        }

        const applicablePricingRules = await getPricingRule(
          this.parentdoc as SalesInvoice
        );

        const itemRule = applicablePricingRules?.find(
          (rule) => rule.applyOnItem === this.item
        );

        if (!itemRule) {
          if (!this.prule) {
            await this.set('itemDiscountAmount', this.itemDiscountAmount);
            return true;
          } else {
            await this.set('itemDiscountAmount', this.fyo.pesa(0));
          }
          return false;
        }
        this.prule = itemRule;

        const pricingRuleDoc = itemRule.pricingRule;

        if (pricingRuleDoc.priceDiscountType === 'amount') {
          const discountAmount =
            pricingRuleDoc.discountAmount ?? this.fyo.pesa(0);
          await this.set('itemDiscountAmount', discountAmount);
          return true;
        }

        return false;
      },
      dependsOn: ['pricingRuleDetail', 'quantity', 'item'],
    },
    itemDiscountPercent: {
      formula: async () => {
        if (!this.fyo.singles.AccountingSettings?.enablePricingRule) {
          return this.itemDiscountPercent ?? 0;
        }

        const pricingRule = this.parentdoc?.pricingRuleDetail?.filter(
          (prDetail) => prDetail.referenceItem === this.item
        );

        if (!pricingRule || !pricingRule.length) {
          if (!this.prule) {
            return this.itemDiscountPercent;
          } else {
            return 0;
          }
        }

        const pricingRuleDoc = (await this.fyo.doc.getDoc(
          ModelNameEnum.PricingRule,
          pricingRule[0].referenceName
        )) as PricingRule;

        if (pricingRuleDoc.discountType === 'Product Discount') {
          return this.itemDiscountPercent ?? 0;
        }

        if (pricingRuleDoc.priceDiscountType === 'percentage') {
          await this.set('setItemDiscountAmount', false);
          return pricingRuleDoc.discountPercentage ?? 0;
        }

        return this.itemDiscountPercent ?? 0;
      },
      dependsOn: ['pricingRuleDetail', 'item'],
    },
  };

  validations: ValidationMap = {
    rate: (value: DocValue) => {
      if ((value as Money).gte(0)) {
        return;
      }

      throw new ValidationError(
        this.fyo.t`Rate (${this.fyo.format(
          value,
          'Currency'
        )}) cannot be less zero.`
      );
    },
    itemDiscountAmount: (value: DocValue) => {
      if ((value as Money).gte(0) && (value as Money).lte(this.amount!.abs())) {
        return;
      }

      throw new ValidationError(
        this.fyo.t`Discount Amount (${this.fyo.format(
          value,
          'Currency'
        )}) cannot be greater than Amount (${this.fyo.format(
          this.amount!,
          'Currency'
        )}).`
      );
    },
    itemDiscountPercent: (value: DocValue) => {
      if ((value as number) <= 100) {
        return;
      }

      throw new ValidationError(
        this.fyo.t`Discount Percent (${
          value as number
        }) cannot be greater than 100.`
      );
    },
    transferUnit: async (value: DocValue) => {
      if (!this.item) {
        return;
      }

      if (value === this.unit) {
        return;
      }

      const item = await this.fyo.db.getAll(ModelNameEnum.UOMConversionItem, {
        fields: ['parent'],
        filters: { uom: value as string, parent: this.item },
      });

      if (item.length < 1) {
        throw new ValidationError(
          t`Transfer Unit ${value as string} is not applicable for Item ${
            this.item
          }`
        );
      }
    },

    qty: async (value: DocValue) => {
      if (this.batch) {
        await this.validateBatchQuantity(this.batch, value as number);
      }
    },

    batch: async (value: DocValue) => {
      if (value) {
        await this.validateBatchQuantity(value as string, this.quantity ?? 0);
      }
    },
  };

  /** Stock location a sale ships from: the POS location or the default. */
  async getStockLocation(): Promise<string | undefined> {
    if (this.parentdoc?.isPOS) {
      return await getPOSInventory(this.fyo);
    }

    return this.parentdoc?.autoStockTransferLocation ?? undefined;
  }

  async validateBatchQuantity(batch: string, quantity: number): Promise<void> {
    if (
      !this.item ||
      !this.isSales ||
      this.isReturn ||
      !this.fyo.singles.InventorySettings?.enableBatches
    ) {
      return;
    }

    const available =
      (await this.fyo.db.getStockQuantity(
        this.item,
        await this.getStockLocation(),
        undefined,
        undefined,
        batch
      )) ?? 0;

    if (quantity > available) {
      throw new ValidationError(
        this.fyo
          .t`Batch ${batch} only has ${available} quantity available but ${quantity} is required`
      );
    }
  }

  hidden: HiddenMap = {
    itemDiscountedTotal: () => {
      if (!this.enableDiscounting) {
        return true;
      }

      if (!!this.setItemDiscountAmount && this.itemDiscountAmount?.isZero()) {
        return true;
      }

      if (!this.setItemDiscountAmount && this.itemDiscountPercent === 0) {
        return true;
      }

      return false;
    },
    setItemDiscountAmount: () => !this.enableDiscounting,
    itemDiscountAmount: () =>
      !(this.enableDiscounting && !!this.setItemDiscountAmount),
    itemDiscountPercent: () =>
      !(this.enableDiscounting && !this.setItemDiscountAmount),
    batch: () => !this.fyo.singles.InventorySettings?.enableBatches,
    transferUnit: () =>
      !this.fyo.singles.InventorySettings?.enableUomConversions,
    transferQuantity: () =>
      !this.fyo.singles.InventorySettings?.enableUomConversions,
    unitConversionFactor: () =>
      !this.fyo.singles.InventorySettings?.enableUomConversions,
  };

  static filters: FiltersMap = {
    item: async (doc: Doc): Promise<QueryFilter> => {
      let itemNotFor = 'Sales';
      if (doc.isSales) {
        itemNotFor = 'Purchases';
      }

      const filters: QueryFilter = {
        for: ['not in', [itemNotFor]],
      };

      return filters;
    },
    batch: async (doc: Doc): Promise<QueryFilter> => {
      const item = doc.item as string;
      if (!doc.isSales || doc.isReturn) {
        return { item };
      }

      const location = await (doc as InvoiceItem).getStockLocation();
      const rows = await doc.fyo.db.getStockQuantities(location, [item]);
      const batches = rows
        .filter((row) => row.batch && row.quantity > 0)
        .map((row) => row.batch as string);
      return { name: ['in', batches] };
    },
    transferUnit: async (doc: Doc) => {
      const conversionItems = await doc.fyo.db.getAll(
        ModelNameEnum.UOMConversionItem,
        {
          fields: ['uom'],
          filters: { parent: doc.item as string },
        }
      );
      const conversionUoms = conversionItems.map((i) => i.uom) as string[];

      const baseUnit = await doc.fyo.getValue(
        ModelNameEnum.Item,
        doc.item as string,
        'unit'
      );
      const validUoms = [...conversionUoms, baseUnit].filter(
        Boolean
      ) as string[];

      return {
        name: ['in', validUoms],
      };
    },
  };

  static createFilters: FiltersMap = {
    item: (doc: Doc) => {
      return { for: doc.isSales ? 'Sales' : 'Purchases' };
    },
  };

  getCurrencies: CurrenciesMap = {};
  _getCurrency() {
    if (this.exchangeRate === 1) {
      return this.fyo.singles.SystemSettings?.currency ?? DEFAULT_CURRENCY;
    }

    return this.currency;
  }
  _setGetCurrencies() {
    const currencyFields = this.schema.fields.filter(
      ({ fieldtype }) => fieldtype === FieldTypeEnum.Currency
    );

    for (const { fieldname } of currencyFields) {
      this.getCurrencies[fieldname] ??= this._getCurrency.bind(this);
    }
  }
}

async function getItemRate(doc: InvoiceItem): Promise<Money | undefined> {
  if (doc.isFreeItem) {
    return doc.rate;
  }

  let pricingRuleRate: Money | undefined;
  if (doc.fyo.singles.AccountingSettings?.enablePricingRule) {
    pricingRuleRate = await getItemRateFromPricingRule(doc);
  }

  if (pricingRuleRate) {
    return pricingRuleRate;
  }

  let priceListRate: Money | undefined;

  if (doc.fyo.singles.AccountingSettings?.enablePriceList) {
    priceListRate = await getItemRateFromPriceList(
      doc,
      doc.parentdoc?.priceList as string
    );
  }

  if (priceListRate) {
    return priceListRate;
  }

  if (!doc.item) {
    return;
  }

  const itemRate = await doc.fyo.getValue(ModelNameEnum.Item, doc.item, 'rate');
  if (isPesa(itemRate)) {
    return itemRate;
  }

  return;
}

async function getItemRateFromPricingRule(
  doc: InvoiceItem
): Promise<Money | undefined> {
  const pricingRule = doc.parentdoc?.pricingRuleDetail?.filter(
    (prDetail) => prDetail.referenceItem === doc.item
  );

  if (!pricingRule || !pricingRule.length) {
    return;
  }

  const pricingRuleDoc = (await doc.fyo.doc.getDoc(
    ModelNameEnum.PricingRule,
    pricingRule[0].referenceName
  )) as PricingRule;

  if (pricingRuleDoc.discountType !== 'Price Discount') {
    return;
  }

  if (pricingRuleDoc.priceDiscountType !== 'rate') {
    return;
  }

  return pricingRuleDoc.discountRate;
}

function getDiscountedTotalBeforeTaxation(
  rate: Money,
  quantity: number,
  itemDiscountAmount: Money,
  itemDiscountPercent: number,
  setDiscountAmount: boolean
) {
  /**
   * If Discount is applied before taxation
   * Use different formulas depending on how discount is set
   * - if amount : Quantity * Rate - DiscountAmount
   * - if percent: Quantity * Rate (1 - DiscountPercent / 100)
   */

  if (setDiscountAmount) {
    return rate.mul(quantity).sub(itemDiscountAmount.mul(Math.sign(quantity)));
  } else if (itemDiscountPercent > 0) {
    return rate.mul(quantity).percent(100 - itemDiscountPercent);
  }
  return rate.mul(quantity);
}

function getTaxedTotalAfterDiscounting(
  totalTaxRate: number,
  rate: Money,
  quantity: number,
  itemDiscountAmount: Money,
  itemDiscountPercent: number,
  setItemDiscountAmount: boolean
) {
  /**
   * If Discount is applied before taxation
   * Formula: Discounted Total * (1 + TotalTaxRate / 100)
   */

  const discountedTotal = getDiscountedTotalBeforeTaxation(
    rate,
    quantity,
    itemDiscountAmount,
    itemDiscountPercent,
    setItemDiscountAmount
  );

  return discountedTotal.mul(1 + totalTaxRate / 100);
}

function getDiscountedTotalAfterTaxation(
  totalTaxRate: number,
  rate: Money,
  quantity: number,
  itemDiscountAmount: Money,
  itemDiscountPercent: number,
  setItemDiscountAmount: boolean
) {
  /**
   * If Discount is applied after taxation
   * Use different formulas depending on how discount is set
   * - if amount : Taxed Total - Discount Amount
   * - if percent: Taxed Total * (1 - Discount Percent / 100)
   */
  const taxedTotal = getTaxedTotalBeforeDiscounting(
    totalTaxRate,
    rate,
    quantity
  );

  if (setItemDiscountAmount) {
    return taxedTotal.sub(itemDiscountAmount.mul(Math.sign(quantity)));
  }

  return taxedTotal.mul(1 - itemDiscountPercent / 100);
}

function getTaxedTotalBeforeDiscounting(
  totalTaxRate: number,
  rate: Money,
  quantity: number
) {
  /**
   * If Discount is applied after taxation
   * Formula: Rate * Quantity * (1 + Total Tax Rate / 100)
   */

  return rate.mul(quantity).mul(1 + totalTaxRate / 100);
}

function getRate(
  quantity: number,
  itemDiscountPercent: number,
  itemDiscountAmount: Money,
  totalTaxRate: number,
  itemTaxedTotal: Money,
  itemDiscountedTotal: Money,
  isItemTaxedTotal: boolean,
  discountAfterTax: boolean,
  setItemDiscountAmount: boolean
) {
  const isItemDiscountedTotal = !isItemTaxedTotal;
  const discountBeforeTax = !discountAfterTax;
  itemDiscountAmount = itemDiscountAmount.mul(Math.sign(quantity));

  if (isItemDiscountedTotal && discountBeforeTax && setItemDiscountAmount) {
    return itemDiscountedTotal.add(itemDiscountAmount).div(quantity);
  }

  if (isItemDiscountedTotal && discountBeforeTax && !setItemDiscountAmount) {
    return itemDiscountedTotal.div(quantity * (1 - itemDiscountPercent / 100));
  }

  if (isItemDiscountedTotal && discountAfterTax && setItemDiscountAmount) {
    return itemDiscountedTotal
      .add(itemDiscountAmount)
      .div(quantity * (1 + totalTaxRate / 100));
  }

  if (isItemDiscountedTotal && discountAfterTax && !setItemDiscountAmount) {
    return itemDiscountedTotal.div(
      (quantity * (100 - itemDiscountPercent) * (100 + totalTaxRate)) / 10000
    );
  }

  if (isItemTaxedTotal && discountAfterTax) {
    return itemTaxedTotal.div(quantity * (1 + totalTaxRate / 100));
  }

  if (isItemTaxedTotal && discountBeforeTax && setItemDiscountAmount) {
    return itemTaxedTotal
      .div(1 + totalTaxRate / 100)
      .add(itemDiscountAmount)
      .div(quantity);
  }

  if (isItemTaxedTotal && discountBeforeTax && !setItemDiscountAmount) {
    return itemTaxedTotal.div(
      quantity * (1 - itemDiscountPercent / 100) * (1 + totalTaxRate / 100)
    );
  }

  return null;
}
