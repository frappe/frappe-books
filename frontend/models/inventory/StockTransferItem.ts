import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import {
  FiltersMap,
  FormulaMap,
  HiddenMap,
  ValidationMap,
} from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { safeParseFloat } from 'utils/index';
import { StockTransfer } from './StockTransfer';
import { TransferItem } from './TransferItem';
import type { Invoice } from 'models/baseModels/Invoice/Invoice';
import type { InvoiceItem } from 'models/baseModels/InvoiceItem/InvoiceItem';
import {
  generateSerialNumbersForItem,
  getExistingActiveSerialNumbersForItem,
} from './helpers';

export class StockTransferItem extends TransferItem {
  item?: string;
  location?: string;

  unit?: string;
  transferUnit?: string;
  quantity?: number;
  transferQuantity?: number;
  unitConversionFactor?: number;

  itemDiscountAmount?: Money;
  itemDiscountPercent?: number;

  rate?: Money;
  amount?: Money;

  description?: string;
  hsnCode?: number;

  batch?: string;
  serialNumber?: string;

  parentdoc?: StockTransfer;

  get isSales() {
    return this.schemaName === ModelNameEnum.ShipmentItem;
  }

  get isReturn(): boolean {
    return !!this.parentdoc?.isReturn;
  }

  /** The row of the invoice this transfer was made from, for the same item. */
  async getInvoiceRow(): Promise<InvoiceItem | undefined> {
    const backReference = this.parentdoc?.backReference;
    if (!backReference || !this.parentdoc) {
      return undefined;
    }

    const invoice = (await this.fyo.doc.getDoc(
      this.parentdoc.invoiceSchemaName,
      backReference
    )) as Invoice;
    return invoice.items?.find((row) => row.item === this.item);
  }

  /** New series numbers on receipts; invoiced or in-stock ones on shipments. */
  async getDefaultSerialNumbers(): Promise<string | undefined> {
    const quantity = Math.abs(this.quantity ?? 0);
    if (!this.item || !this.parentdoc?.backReference || quantity <= 0) {
      return undefined;
    }

    if (!this.isSales) {
      return await generateSerialNumbersForItem(this.fyo, this.item, quantity);
    }

    return (
      (await this.getInvoiceRow())?.serialNumber ||
      (await getExistingActiveSerialNumbersForItem(
        this.fyo,
        this.item,
        quantity
      ))
    );
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
        if (fieldname === 'quantity' || fieldname === 'unit') {
          return this.unit;
        }

        return (await this.fyo.getValue(
          'Item',
          this.item as string,
          'unit'
        )) as string;
      },
      dependsOn: ['item', 'unit'],
    },
    transferQuantity: {
      formula: (fieldname) => {
        if (fieldname === 'quantity' || this.unit === this.transferUnit) {
          return this.quantity;
        }

        return this.transferQuantity;
      },
      dependsOn: ['item', 'quantity'],
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
        'isReturn',
      ],
    },
    unitConversionFactor: {
      formula: async () => {
        if (this.unit === this.transferUnit) {
          return 1;
        }

        const conversionFactor = await this.fyo.db.getAll(
          ModelNameEnum.UOMConversionItem,
          {
            fields: ['conversionFactor'],
            filters: { parent: this.item! },
          }
        );

        return safeParseFloat(conversionFactor[0]?.conversionFactor ?? 1);
      },
      dependsOn: ['transferUnit'],
    },
    hsnCode: {
      formula: async () =>
        (await this.fyo.getValue(
          'Item',
          this.item as string,
          'hsnCode'
        )) as string,
      dependsOn: ['item'],
    },
    amount: {
      formula: () => {
        return this.rate?.mul(this.quantity ?? 0) ?? this.fyo.pesa(0);
      },
      dependsOn: ['rate', 'quantity'],
    },
    itemDiscountAmount: {
      formula: async () => (await this.getInvoiceRow())?.itemDiscountAmount,
      dependsOn: ['items'],
    },
    itemDiscountPercent: {
      formula: async () => (await this.getInvoiceRow())?.itemDiscountPercent,
      dependsOn: ['items'],
    },
    rate: {
      formula: async () => {
        const rate = (await this.fyo.getValue(
          'Item',
          this.item as string,
          'rate'
        )) as undefined | Money;

        if (!rate?.float && this.rate?.float) {
          return this.rate;
        }

        return rate ?? this.fyo.pesa(0);
      },
      dependsOn: ['item'],
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
    location: {
      formula: () => {
        if (this.location) {
          return;
        }

        const defaultLocation =
          this.fyo.singles.InventorySettings?.defaultLocation;

        if (defaultLocation && !this.location) {
          return defaultLocation;
        }
      },
    },
    serialNumber: {
      formula: async () =>
        this.serialNumber ||
        (await this.getDefaultSerialNumbers()) ||
        undefined,
      dependsOn: ['item', 'quantity'],
    },
  };

  validations: ValidationMap = {
    transferUnit: async (value: DocValue) => {
      if (!this.item) {
        return;
      }

      const item = await this.fyo.db.getAll(ModelNameEnum.UOMConversionItem, {
        fields: ['parent'],
        filters: { uom: value as string, parent: this.item },
      });

      if (item.length < 1)
        throw new ValidationError(
          this.fyo.t`Transfer Unit ${
            value as string
          } is not applicable for Item ${this.item}`
        );
    },
  };

  static filters: FiltersMap = {
    item: (doc: Doc) => {
      let itemNotFor = 'Sales';
      if (doc.isSales) {
        itemNotFor = 'Purchases';
      }

      return { for: ['not in', [itemNotFor]], trackItem: true };
    },
  };

  override hidden: HiddenMap = {
    itemDiscountAmount: () => {
      if (this.itemDiscountAmount && !this.itemDiscountAmount?.isZero()) {
        return false;
      }

      return true;
    },
    itemDiscountPercent: () => !this.itemDiscountPercent,
    batch: () => !this.fyo.singles.InventorySettings?.enableBatches,
    serialNumber: () => !this.fyo.singles.InventorySettings?.enableSerialNumber,
    transferUnit: () =>
      !this.fyo.singles.InventorySettings?.enableUomConversions,
    transferQuantity: () =>
      !this.fyo.singles.InventorySettings?.enableUomConversions,
    unitConversionFactor: () =>
      !this.fyo.singles.InventorySettings?.enableUomConversions,
  };
}
