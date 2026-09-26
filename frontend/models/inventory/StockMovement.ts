import { Fyo, t } from 'fyo';
import {
  Action,
  DefaultMap,
  FiltersMap,
  FormulaMap,
  ListViewSettings,
} from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { getDocStatusListColumn, getLedgerLinkAction } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { StockMovementItem } from './StockMovementItem';
import { Transfer } from './Transfer';
import { createMissingBatches, generateBatchForItem } from './helpers';
import { MovementType, MovementTypeEnum } from './types';

export class StockMovement extends Transfer {
  name?: string;
  date?: Date;
  numberSeries?: string;
  movementType?: MovementType;
  items?: StockMovementItem[];
  amount?: Money;

  override get isTransactional(): boolean {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  formulas: FormulaMap = {
    amount: {
      formula: () => {
        return this.items?.reduce(
          (acc, item) => acc.add(item.amount ?? 0),
          this.fyo.pesa(0)
        );
      },
      dependsOn: ['items'],
    },
  };

  async validate() {
    await super.validate();
    await createMissingBatches(this);
  }

  static filters: FiltersMap = {
    numberSeries: () => ({ referenceType: ModelNameEnum.StockMovement }),
  };

  static defaults: DefaultMap = {
    date: () => new Date(),
  };

  static getListViewSettings(fyo: Fyo): ListViewSettings {
    const movementTypeMap = {
      [MovementTypeEnum.MaterialIssue]: fyo.t`Material Issue`,
      [MovementTypeEnum.MaterialReceipt]: fyo.t`Material Receipt`,
      [MovementTypeEnum.MaterialTransfer]: fyo.t`Material Transfer`,
      [MovementTypeEnum.Manufacture]: fyo.t`Manufacture`,
    };

    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'date',
        {
          label: fyo.t`Movement Type`,
          fieldname: 'movementType',
          fieldtype: 'Select',
          display(value): string {
            return movementTypeMap[value as MovementTypeEnum] ?? '';
          },
        },
      ],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return [getLedgerLinkAction(fyo, true)];
  }

  async addItem(name: string) {
    const itemDoc = await this.fyo.doc.getDoc(ModelNameEnum.Item, name);
    if (!itemDoc) {
      throw new ValidationError(t`Item ${name} not found`);
    }

    let batch: string | null | undefined =
      (itemDoc.defaultBatch as string | null | undefined) ?? null;

    if (
      this.movementType === MovementTypeEnum.MaterialReceipt &&
      itemDoc.hasBatch &&
      !batch
    ) {
      batch = await generateBatchForItem(this.fyo, name);
    }

    const item = {
      name: itemDoc.name,
      batch,
    };

    if (item.batch) {
      const batchDoc = await this.fyo.doc.getDoc(
        ModelNameEnum.Batch,
        item.batch
      );
      if (batchDoc && batchDoc.item !== name) {
        throw new ValidationError(
          t`Batch ${item.batch} does not belong to Item ${name}`
        );
      }
    }

    return item;
  }
}
