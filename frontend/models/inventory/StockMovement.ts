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
    nameField: { label: 'Stock Movement No.', hidden: true },
    quickEditFields: [
      'number_series',
      'date',
      'movement_type',
      'amount',
      'items',
    ],
    fields: {
      items: { edit: true },
      movement_type: {
        optionLabels: {
          [MovementTypeEnum.MaterialIssue]: 'Material Issue',
          [MovementTypeEnum.MaterialReceipt]: 'Material Receipt',
          [MovementTypeEnum.MaterialTransfer]: 'Material Transfer',
        },
      },
    },
    fileFields: [
      'name',
      'number_series',
      'movement_type',
      'date',
      'items',
      'amount',
      'status',
    ],
  };
  static override previewMethod = 'preview';
  static override rowModels = { items: StockMovementItem };

  static filters: FiltersMap = {
    number_series: () => [['reference_type', '=', ModelNameEnum.StockMovement]],
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
    return [getLedgerLinkAction(fyo), getLedgerLinkAction(fyo, true)];
  }

  async addItem(name: string) {
    return await addItem(name, this);
  }
}
