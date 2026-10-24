import { FiltersMap, HiddenMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import { AccountRootTypeEnum } from '../Account/types';

/** A Books Item Default row: an item's accounts and warehouse for a company. */
export class ItemDefault extends FrappeDoc {
  static override presentation = { label: 'Item Default' };

  hidden: HiddenMap = {
    default_warehouse: () => !this.fyo.isFeatureOn('enable_inventory'),
  };

  // A tracked item is bought into stock received but not billed, a liability.
  static filters: FiltersMap = {
    income_account: () => [
      ['is_group', '=', 0],
      ['root_type', '=', AccountRootTypeEnum.Income],
    ],
    expense_account: (doc: FrappeDoc) => [
      ['is_group', '=', 0],
      [
        'root_type',
        '=',
        doc.parentdoc?.is_stock_item
          ? AccountRootTypeEnum.Liability
          : AccountRootTypeEnum.Expense,
      ],
    ],
  };
}
