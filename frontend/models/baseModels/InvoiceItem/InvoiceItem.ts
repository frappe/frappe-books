import { Fyo } from 'fyo';
import { DocValue, DocValueMap } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import {
  CurrenciesMap,
  ChangeArg,
  DefaultMap,
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
import {
  getUnitConversionFactor,
  validateTransferUnit,
} from 'models/inventory/units';
import { QueryFilter } from 'utils/db/types';

const ITEM_DETAILS = ['tax', 'description', 'itemCode', 'account', 'hsnCode'];

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

    // The server names an empty batch from the new item's series on save.
    if (ch.changed === 'item' && !this.isSales && this.batch) {
      await this.set('batch', '');
    }
  }

  override async _applyChange(
    fieldname: string,
    retriggerChildDocApplyChange?: boolean
  ) {
    if (this.parentdoc) {
      this.parentdoc._edits += 1;
    }
    if (fieldname === 'rate') {
      this.isManualRate = true;
    } else if (['item', 'transferUnit'].includes(fieldname)) {
      this.clearStandardRate();
    }
    if (fieldname === 'item') {
      this.clearItemDetails();
    }
    return super._applyChange(fieldname, retriggerChildDocApplyChange);
  }

  /** The server's invoice preview fills empty item details from the new item. */
  clearItemDetails() {
    for (const fieldname of ITEM_DETAILS) {
      this[fieldname] = undefined;
    }
  }

  /** An empty rate that is not manual is priced by the server's invoice preview. */
  clearStandardRate() {
    this.isManualRate = false;
    this.rate = this.fyo.pesa(0);
  }

  formulas: FormulaMap = {
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
      formula: (fieldname) => {
        if (!this.item) {
          return this.quantity as number;
        }

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
        const factor = await getUnitConversionFactor(this);
        this.quantity = factor * this.transferQuantity!;
        return factor;
      },
      dependsOn: ['transferUnit', 'qty'],
    },
  };

  validations: ValidationMap = {
    transferUnit: async (value: DocValue) =>
      await validateTransferUnit(this, value as string),

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

  /** Stock location a sale ships from, as the server picks it. */
  async getStockLocation(): Promise<string | undefined> {
    if (!this.parentdoc) {
      return undefined;
    }

    return (
      (await this.fyo.db.getStockLocation(
        this.parentdoc.schemaName,
        !!this.parentdoc.isPOS
      )) ?? undefined
    );
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

  // The server derives a missing quantity from the other, so a new row's start is set here.
  static defaults: DefaultMap = {
    quantity: () => 1,
    transferQuantity: () => 1,
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
