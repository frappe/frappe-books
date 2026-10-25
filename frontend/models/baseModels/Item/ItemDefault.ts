import { FiltersMap, HiddenMap } from 'fyo/model/types';
import type { Filter } from 'src/frappe/api';
import { FrappeDoc } from 'src/frappe/document';
import { AccountRootTypeEnum } from '../Account/types';

/** A Books Item Default row: an item's accounts and warehouse for a company. */
export class ItemDefault extends FrappeDoc {
  static override presentation = { label: 'Item Default' };

  hidden: HiddenMap = {
    default_warehouse: () => !this.fyo.isFeatureOn('enable_inventory'),
  };

  static filters: FiltersMap = {
    income_account: () => getIncomeAccountFilters(),
    expense_account: (doc: FrappeDoc) =>
      getExpenseAccountFilters(doc.parentdoc),
  };
}

export function getIncomeAccountFilters(): Filter[] {
  return [
    ['is_group', '=', 0],
    ['root_type', '=', AccountRootTypeEnum.Income],
  ];
}

/** A tracked item is bought into stock received but not billed, a liability. */
export function getExpenseAccountFilters(item?: FrappeDoc): Filter[] {
  const rootType = item?.is_stock_item
    ? AccountRootTypeEnum.Liability
    : AccountRootTypeEnum.Expense;
  return [
    ['is_group', '=', 0],
    ['root_type', '=', rootType],
  ];
}
