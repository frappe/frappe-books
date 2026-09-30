import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import {
  ChangeArg,
  FiltersMap,
  FormulaMap,
  HiddenMap,
  ReadOnlyMap,
  RequiredMap,
  ValidationMap,
} from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { safeParseFloat } from 'utils/index';
import { getSerialNumbersForQuantity } from './helpers';
import { StockMovement } from './StockMovement';
import { TransferItem } from './TransferItem';
import { getUnitConversionFactor, validateTransferUnit } from './units';
import { MovementTypeEnum } from './types';
import { Doc } from 'fyo/model/doc';

export class StockMovementItem extends TransferItem {
  name?: string;
  item?: string;
  fromLocation?: string;
  toLocation?: string;

  unit?: string;
  transferUnit?: string;
  quantity?: number;
  transferQuantity?: number;
  unitConversionFactor?: number;

  rate?: Money;
  amount?: Money;

  batch?: string;
  serialNumber?: string;

  parentdoc?: StockMovement;

  get isIssue() {
    return this.parentdoc?.movementType === MovementTypeEnum.MaterialIssue;
  }

  get isReceipt() {
    return this.parentdoc?.movementType === MovementTypeEnum.MaterialReceipt;
  }

  get isTransfer() {
    return this.parentdoc?.movementType === MovementTypeEnum.MaterialTransfer;
  }

  get isManufacture() {
    return this.parentdoc?.movementType === MovementTypeEnum.Manufacture;
  }

  static filters: FiltersMap = {
    // Items are Frappe-backed, so their filters use Frappe fieldnames.
    item: () => ({ track_item: true }),
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
    batch: (doc: Doc) => ({ item: doc.item as string }),
  };

  formulas: FormulaMap = {
    rate: {
      formula: async () => {
        if (!this.item) {
          return this.rate;
        }

        return await this.fyo.getValue(ModelNameEnum.Item, this.item, 'rate');
      },
      dependsOn: ['item'],
    },
    amount: {
      formula: () => this.rate!.mul(this.quantity!),
      dependsOn: ['item', 'rate', 'quantity'],
    },
    fromLocation: {
      formula: () => {
        if (this.isReceipt || this.isTransfer || this.isManufacture) {
          return null;
        }

        const defaultLocation =
          this.fyo.singles.InventorySettings?.defaultLocation;
        if (defaultLocation && !this.fromLocation && this.isIssue) {
          return defaultLocation;
        }

        return this.toLocation;
      },
      dependsOn: ['movementType'],
    },
    toLocation: {
      formula: () => {
        if (this.isIssue || this.isTransfer || this.isManufacture) {
          return null;
        }

        const defaultLocation =
          this.fyo.singles.InventorySettings?.defaultLocation;
        if (defaultLocation && !this.toLocation && this.isReceipt) {
          return defaultLocation;
        }

        return this.toLocation;
      },
      dependsOn: ['movementType'],
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
      formula: (fieldname) => {
        if (!this.item) {
          return this.quantity as number;
        }

        let quantity: number = this.quantity ?? 1;
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
      ],
    },
    unitConversionFactor: {
      formula: async () => await getUnitConversionFactor(this),
      dependsOn: ['transferUnit'],
    },
  };

  validations: ValidationMap = {
    batch: async (value: DocValue) => {
      const batchItem = await this.fyo.getValue(
        ModelNameEnum.Batch,
        value as string,
        'item'
      );
      if (this.item && batchItem && batchItem !== this.item) {
        throw new ValidationError(
          t`Batch ${value as string} does not belong to Item ${this.item}`
        );
      }
    },
    transferUnit: async (value: DocValue) =>
      await validateTransferUnit(this, value as string),
  };

  required: RequiredMap = {
    fromLocation: () => this.isIssue || this.isTransfer,
    toLocation: () => this.isReceipt || this.isTransfer,
  };

  readOnly: ReadOnlyMap = {
    fromLocation: () => this.isReceipt,
    toLocation: () => this.isIssue,
  };

  override hidden: HiddenMap = {
    batch: () => !this.fyo.singles.InventorySettings?.enableBatches,
    serialNumber: () => !this.fyo.singles.InventorySettings?.enableSerialNumber,
    transferUnit: () =>
      !this.fyo.singles.InventorySettings?.enableUomConversions,
    transferQuantity: () =>
      !this.fyo.singles.InventorySettings?.enableUomConversions,
    unitConversionFactor: () =>
      !this.fyo.singles.InventorySettings?.enableUomConversions,
  };

  static createFilters: FiltersMap = {
    item: () => ({ track_item: true, item_type: 'Product' }),
  };

  override async change(ch: ChangeArg): Promise<void> {
    await super.change(ch);
    if (ch.changed === 'item') {
      await this.set('serialNumber', '');
      await this.clearReceiptBatch();
    }

    if (ch.changed === 'item' || ch.changed === 'quantity') {
      await this.setNewSerialNumbers();
    }
  }

  /** The server names an empty receipt batch from the new item's series on save. */
  async clearReceiptBatch() {
    if (this.isReceipt && this.batch) {
      await this.set('batch', '');
    }
  }

  async setNewSerialNumbers() {
    if (!this.quantity || this.quantity <= 0) {
      await this.set('serialNumber', '');
      return;
    }

    if (!this.isReceipt || !this.item) {
      return;
    }

    const serialNumbers = await getSerialNumbersForQuantity(
      this.fyo,
      this.item,
      this.serialNumber,
      this.quantity
    );
    if (serialNumbers) {
      await this.set('serialNumber', serialNumbers);
    }
  }
}
