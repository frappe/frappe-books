import type { Fyo } from 'fyo';
import type { Action, FiltersMap, ListViewSettings } from 'fyo/model/types';
import {
  addItem,
  getDocStatusListColumn,
  getLedgerLinkAction,
} from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { FrappeDoc } from 'src/frappe/document';
import { StockMovementItem } from './StockMovementItem';
import { MovementTypeEnum } from './types';

/**
 * Books Stock Movement, served by Frappe. Its `preview` fills the number
 * series, row units, rates, locations and the total while the user edits.
 */
export class StockMovement extends FrappeDoc {
  static override doctype = 'Books Stock Movement';
  static override presentation = {
    label: 'Stock Movement',
    nameField: { label: 'Stock Movement No.' },
    quickEditFields: [
      'number_series',
      'date',
      'movement_type',
      'amount',
      'items',
    ],
    optionLabels: {
      movement_type: {
        [MovementTypeEnum.MaterialIssue]: 'Material Issue',
        [MovementTypeEnum.MaterialReceipt]: 'Material Receipt',
        [MovementTypeEnum.MaterialTransfer]: 'Material Transfer',
      },
    },
  };
  static override previewMethod = 'preview';
  static override rowModels = { items: StockMovementItem };

  // Number series are still read through the bridge.
  static filters: FiltersMap = {
    number_series: () => ({ referenceType: ModelNameEnum.StockMovement }),
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
          fieldname: 'movement_type',
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
    return await addItem(name, this);
  }
}
