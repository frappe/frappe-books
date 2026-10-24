import type { Fyo } from 'fyo';
import type { Action, FiltersMap, ListViewSettings } from 'fyo/model/types';
import {
  addItem,
  getDocStatusListColumn,
  getLedgerLinkAction,
} from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { FrappeDoc } from 'src/frappe/document';
import { StockEntryDetail } from './StockEntryDetail';

/**
 * Books Stock Entry, served by Frappe. Its `preview` fills the number
 * series, row units, rates, warehouses and the total while the user edits.
 */
export class StockEntry extends FrappeDoc {
  static override doctype = 'Books Stock Entry';
  static override presentation = {
    label: 'Stock Entry',
    nameField: { label: 'Stock Entry No.', hidden: true },
    quickEditFields: [
      'naming_series',
      'posting_date',
      'purpose',
      'total_amount',
      'items',
    ],
    fields: { items: { edit: true } },
    fileFields: [
      'name',
      'naming_series',
      'purpose',
      'posting_date',
      'items',
      'total_amount',
    ],
  };
  static override previewMethod = 'preview';
  static override rowModels = { items: StockEntryDetail };

  static filters: FiltersMap = {
    naming_series: () => [['reference_type', '=', ModelNameEnum.StockEntry]],
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', getDocStatusListColumn(), 'posting_date', 'purpose'],
    };
  }

  static getActions(fyo: Fyo): Action[] {
    return [getLedgerLinkAction(fyo), getLedgerLinkAction(fyo, true)];
  }

  async addItem(name: string) {
    return await addItem(name, this);
  }
}
