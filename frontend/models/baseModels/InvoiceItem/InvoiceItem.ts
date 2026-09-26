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
    if (fieldname === 'rate') {
      this.isManualRate = true;
    } else if (['item', 'transferUnit'].includes(fieldname)) {
      this.clearStandardRate();
    }
    return super._applyChange(fieldname, retriggerChildDocApplyChange);
  }

  /** An empty rate that is not manual is priced by the server's invoice preview. */
  clearStandardRate() {
    this.isManualRate = false;
    this.rate = this.fyo.pesa(0);
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
        const unitDoc = await itemDoc.loadAndGetLink('uom');

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
    hsnCode: {
      formula: async () =>
        await this.fyo.getValue('Item', this.item as string, 'hsnCode'),
      dependsOn: ['item'],
    },
  };

  validations: ValidationMap = {
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
