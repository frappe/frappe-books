import { Fyo, t } from 'fyo';
import {
  ColumnConfig,
  LinkedRecords,
  ListViewColumn,
  ListViewSettings,
} from 'fyo/model/types';
import { FieldTypeEnum } from 'schemas/types';
import { FrappeDoc } from 'src/frappe/document';
import { getField } from 'src/frappe/registry';

const COLUMNS = [
  'item_code',
  'price_list',
  'uom',
  'price_list_rate',
  'valid_from',
  'valid_upto',
];
const DATE_FIELDS = ['valid_from', 'valid_upto'];

/** Books Item Price, served by Frappe: an item's rate in a price list, per unit and dates. */
export class ItemPrice extends FrappeDoc {
  static override doctype = 'Books Item Price';
  static override presentation = {
    label: 'Item Price',
    fields: { uom: { create: false } },
  };
  static override previewMethod = 'preview';
  // The server fetches an empty unit from the item.
  static override refills = { item_code: ['uom'] };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: getItemPriceColumns(),
      emptyState: {
        title: t`No item prices`,
        description: t`Each Item Price sets a rate for one item in one price list.`,
        createLabel: t`New item price`,
        filteredTitle: t`No item prices match these filters`,
      },
    };
  }
}

/** The prices of a saved item or price list, which its form lists. */
export function getItemPrices(
  fyo: Fyo,
  linkField: 'item_code' | 'price_list',
  emptyMessage: string
): LinkedRecords | undefined {
  if (!fyo.isFeatureOn('enable_price_list')) {
    return;
  }

  return {
    schemaName: 'ItemPrice',
    linkField,
    label: t`Item prices`,
    columns: getItemPriceColumns(linkField),
    addLabel: t`Add item price`,
    emptyMessage,
    dateRange: ['valid_from', 'valid_upto'],
  };
}

/** Item Price columns, without the one `omitted`; an empty date shows as —. */
function getItemPriceColumns(omitted?: string): ListViewColumn[] {
  return COLUMNS.filter((fieldname) => fieldname !== omitted).map(
    (fieldname) =>
      DATE_FIELDS.includes(fieldname) ? getDateColumn(fieldname) : fieldname
  );
}

function getDateColumn(fieldname: string): ColumnConfig {
  return {
    label: getField('ItemPrice', fieldname)?.label ?? fieldname,
    fieldname,
    fieldtype: FieldTypeEnum.Date,
    display: (value, fyo) => (value ? fyo.format(value, 'Date') : '—'),
  };
}
