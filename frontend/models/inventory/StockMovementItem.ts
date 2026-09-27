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
import { generateSerialNumbersForItem, getSuggestedBatchName } from './helpers';
import { StockMovement } from './StockMovement';
import { TransferItem } from './TransferItem';
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
    item: () => ({ trackItem: true }),
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
  };

  validations: ValidationMap = {
    batch:async (value: DocValue) => {
      // A new batch has no record until the movement saves.
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
          t`Transfer Unit ${value as string} is not applicable for Item ${
            this.item
          }`
        );
    },
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
    item: () => ({ trackItem: true, itemType: 'Product' }),
  };

  override async change(ch: ChangeArg): Promise<void> {
    await super.change(ch);
    if (ch.changed === 'item') {
      await this.set('serialNumber', '');
      await this.setSuggestedBatch();
    }

    if (ch.changed === 'item' || ch.changed === 'quantity') {
      await this.setNewSerialNumbers();
    }
  }

  async setSuggestedBatch() {
    if (!this.isReceipt || !this.item) {
      return;
    }

    if (await this.fyo.getValue(ModelNameEnum.Item, this.item, 'hasBatch')) {
      const batch = await getSuggestedBatchName(this.fyo, this.item);
      if (batch) {
        await this.set('batch', batch);
      }
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

    const serialNumbers = await generateSerialNumbersForItem(
      this.fyo,
      this.item,
      this.quantity
    );
    if (serialNumbers) {
      await this.set('serialNumber', serialNumbers);
    }
  }
}
