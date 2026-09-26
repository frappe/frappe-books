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
import { Item } from '../Item/Item';
import { StockTransfer } from 'models/inventory/StockTransfer';
import { getSuggestedBatchName } from 'models/inventory/helpers';
import {
  getRawStockLedgerEntries,
  getStockLedgerEntries,
  getStockBalanceEntries,
} from 'reports/inventory/helpers';
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
    hsnCode: {
      formula: async () =>
        await this.fyo.getValue('Item', this.item as string, 'hsnCode'),
      dependsOn: ['item'],
    },
    stockNotTransferred: {
      formula: async () => {
        if (this.parentdoc?.isSubmitted) {
          return;
        }

        const item = (await this.loadAndGetLink('item')) as Item;
        if (!item.trackItem) {
          return 0;
        }

        const { backReference, stockTransferSchemaName } = this.parentdoc ?? {};
        if (
          !backReference ||
          !stockTransferSchemaName ||
          typeof this.quantity !== 'number'
        ) {
          return this.quantity;
        }

        const refdoc = (await this.fyo.doc.getDoc(
          stockTransferSchemaName,
          backReference
        )) as StockTransfer;

        const transferred =
          refdoc.items
            ?.filter((i) => i.item === this.item)
            .reduce((acc, i) => i.quantity ?? 0 + acc, 0) ?? 0;

        return Math.max(0, this.quantity - transferred);
      },
      dependsOn: ['item', 'quantity'],
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
      const requiredQuantity = Math.abs(value as number);

      if (!this.item || requiredQuantity <= 0) {
        return;
      }

      if (!this.isSales) {
        return;
      }

      if (!this.fyo.singles.InventorySettings?.enableBatches) {
        return;
      }

      if (!this.batch) {
        return;
      }

      await this.validateBatchQuantity(this.batch, requiredQuantity);
    },

    batch: async (value: DocValue) => {
      if (!value || !this.item) {
        return;
      }

      if (!this.isSales) {
        return;
      }

      if (!this.fyo.singles.InventorySettings?.enableBatches) {
        return;
      }

      const requiredQuantity = this.quantity ?? 0;

      if (requiredQuantity > 0) {
        await this.validateBatchQuantity(value as string, requiredQuantity);
      } else if (requiredQuantity < 0) {
        await this.validateBatchQuantity(
          value as string,
          Math.abs(requiredQuantity)
        );
      }
    },
  };

  async validateBatchQuantity(
    batchName: string,
    requiredQuantity: number
  ): Promise<void> {
    let inventoryLocation: string | undefined;

    if (this.location) {
      inventoryLocation = this.location as string;
    } else {
      const posProfileName = this.fyo.singles.POSSettings?.posProfile;

      if (posProfileName) {
        const inventory = await this.fyo.getValue(
          ModelNameEnum.POSProfile,
          posProfileName as string,
          'inventory'
        );

        inventoryLocation = inventory as string | undefined;
      } else {
        inventoryLocation = this.fyo.singles.POSSettings?.inventory;
      }
    }

    const rawSLEs = await getRawStockLedgerEntries(this.fyo);
    const computedSLEs = getStockLedgerEntries(rawSLEs);

    const stockBalance = getStockBalanceEntries(computedSLEs, {
      item: this.item!,
      location: inventoryLocation,
      batch: batchName,
    });

    const availableQuantity = stockBalance.reduce(
      (sum, entry) => sum + (entry.balanceQuantity || 0),
      0
    );

    if (requiredQuantity > availableQuantity) {
      throw new ValidationError(
        this.fyo.t`
        Batch ${batchName} only has ${availableQuantity} quantity available
        but ${requiredQuantity} is required
      `
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
    batch: async (doc: Doc) => {
      const hasBatch = !!(await doc.fyo.getValue(
        ModelNameEnum.Item,
        doc.item as string,
        'hasBatch'
      ));

      if (!hasBatch) {
        return { name: ['in', []] };
      }

      let suggestedBatch: string | undefined;

      if (!doc.isSales) {
        suggestedBatch = await getSuggestedBatchName(
          doc.fyo,
          doc.item as string
        );

        if (suggestedBatch) {
          await doc.set('batch', suggestedBatch);
        }
      }

      try {
        let inventoryLocation: string | undefined;

        if (doc.location) {
          inventoryLocation = doc.location as string;
        } else {
          const posProfileName = doc.fyo.singles.POSSettings?.posProfile;
          if (posProfileName) {
            const posProfile = await doc.fyo.doc.getDoc(
              ModelNameEnum.POSProfile,
              posProfileName as string
            );
            inventoryLocation = posProfile?.inventory as string | undefined;
          } else {
            inventoryLocation = doc.fyo.singles.POSSettings?.inventory;
          }
        }

        const rawSLEs = await getRawStockLedgerEntries(doc.fyo);
        const computedSLEs = getStockLedgerEntries(rawSLEs);

        const stockBalance = getStockBalanceEntries(computedSLEs, {
          item: doc.item as string,
          location: inventoryLocation,
        });

        const batchesWithStock = stockBalance
          .filter((entry) => entry.batch && entry.balanceQuantity > 0)
          .map((entry) => entry.batch);

        const allBatches = new Set<string>(batchesWithStock);
        if (suggestedBatch) {
          allBatches.add(suggestedBatch);
        }

        const finalBatchList = Array.from(allBatches);

        return {
          name: ['in', finalBatchList],
        };
      } catch (error) {
        const batches = await doc.fyo.db.getAll(ModelNameEnum.Batch, {
          fields: ['name'],
          filters: { item: doc.item as string },
        });
        const batchNames = batches.map((b) => b.name) as string[];

        const allBatches = new Set<string>(batchNames);
        if (suggestedBatch) {
          allBatches.add(suggestedBatch);
        }

        const finalBatchList = Array.from(allBatches);

        return {
          name: ['in', finalBatchList],
        };
      }
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
