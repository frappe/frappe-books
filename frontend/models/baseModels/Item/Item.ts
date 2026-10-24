import { Fyo } from 'fyo';
import { DocValue } from 'fyo/core/types';
import {
  Action,
  FiltersMap,
  HiddenMap,
  ListViewSettings,
  ValidationMap,
} from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { getMappedDocAction } from 'models/helpers';
import { isHsnCodeHidden } from 'models/regionalModels/in/hsnCode';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { FrappeDoc } from 'src/frappe/document';
import { AccountRootTypeEnum } from '../Account/types';
import { ItemBarcode } from './ItemBarcode';
import { UOMConversionDetail } from './UOMConversionDetail';

/**
 * Books Item, served by Frappe. The DocType owns its fields, defaults and
 * rules; its `preview` fills accounts and fetched values while the user edits.
 */
export class Item extends FrappeDoc {
  static override doctype = 'Books Item';
  static override presentation = {
    label: 'Item',
    quickEditFields: [
      'standard_rate',
      'stock_uom',
      'item_type',
      'tax',
      'description',
      'income_account',
      'expense_account',
      'barcodes',
      'gst_hsn_code',
      'is_stock_item',
    ],
  };
  static override rowModels = {
    barcodes: ItemBarcode,
    uoms: UOMConversionDetail,
  };
  static override previewMethod = 'preview';

  // The server checks these too; mirrored to show the message at the field.
  validations: ValidationMap = {
    standard_rate: (value: DocValue) => {
      if ((value as Money).isNegative()) {
        throw new ValidationError(this.fyo.t`Rate can't be negative.`);
      }
    },
    gst_hsn_code: (value: DocValue) => {
      if (isHsnCodeHidden(this.fyo)) {
        return;
      }

      if (value && !(value as string).match(/^\d{4,8}$/)) {
        throw new ValidationError(this.fyo.t`Invalid HSN Code.`);
      }
    },
  };

  // Fields of features turned off in the settings. The DocType's depends_on hides the rest.
  hidden: HiddenMap = {
    gst_hsn_code: () => isHsnCodeHidden(this.fyo),
    is_stock_item: () => !this.fyo.singles.AccountingSettings?.enable_inventory,
    barcodes: () => !this.fyo.singles.InventorySettings?.enable_barcodes,
    has_batch_no: () => !this.fyo.singles.InventorySettings?.enable_batches,
    has_serial_no: () =>
      !this.fyo.singles.InventorySettings?.enable_serial_number,
    uoms: () => !this.fyo.singles.InventorySettings?.enable_uom_conversions,
    item_group: () => !this.fyo.singles.AccountingSettings?.enableitem_group,
  };

  static filters: FiltersMap = {
    income_account: () => [
      ['is_group', '=', 0],
      ['root_type', '=', AccountRootTypeEnum.Income],
    ],
    expense_account: (doc) => [
      ['is_group', '=', 0],
      [
        'root_type',
        '=',
        doc.is_stock_item
          ? AccountRootTypeEnum.Liability
          : AccountRootTypeEnum.Expense,
      ],
    ],
  };

  static getActions(fyo: Fyo): Action[] {
    return [
      getMappedDocAction(fyo, {
        group: fyo.t`Create`,
        label: fyo.t`Sales Invoice`,
        condition: (doc) => !doc.notInserted,
        target: () => [ModelNameEnum.SalesInvoice, 'make_sales_invoice'],
      }),
      getMappedDocAction(fyo, {
        group: fyo.t`Create`,
        label: fyo.t`Purchase Invoice`,
        condition: (doc) => !doc.notInserted,
        target: () => [ModelNameEnum.PurchaseInvoice, 'make_purchase_invoice'],
      }),
    ];
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'stock_uom', 'tax', 'standard_rate'],
    };
  }
}
