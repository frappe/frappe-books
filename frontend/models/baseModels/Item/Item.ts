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
import { getMappedDoc } from 'models/helpers';
import { isHsnCodeHidden } from 'models/regionalModels/in/hsnCode';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { FrappeDoc } from 'src/frappe/document';
import { getFrappeRows } from 'src/frappe/list';
import { AccountRootTypeEnum } from '../Account/types';
import { UOMConversionItem } from './UOMConversionItem';

/**
 * Books Item, served by Frappe. The DocType owns its fields, defaults and
 * rules; its `preview` fills accounts and fetched values while the user edits.
 */
export class Item extends FrappeDoc {
  static override doctype = 'Books Item';
  static override presentation = {
    label: 'Item',
    nameField: { label: 'Item Name', placeholder: 'Item Name' },
    quickEditFields: [
      'rate',
      'unit',
      'item_type',
      'item_usage',
      'tax',
      'description',
      'income_account',
      'expense_account',
      'barcode',
      'hsn_code',
      'track_item',
    ],
  };
  static override rowModels = { uom_conversions: UOMConversionItem };
  static override previewMethod = 'preview';

  // The server checks these too; mirrored to show the message at the field.
  validations: ValidationMap = {
    barcode: (value: DocValue) => {
      if (value && !(value as string).match(/^\d{12}$/)) {
        throw new ValidationError(
          this.fyo.t`Barcode must be exactly 12 digits.`
        );
      }
    },
    rate: (value: DocValue) => {
      if ((value as Money).isNegative()) {
        throw new ValidationError(this.fyo.t`Rate can't be negative.`);
      }
    },
    hsn_code: (value: DocValue) => {
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
    hsn_code: () => isHsnCodeHidden(this.fyo),
    track_item: () => !this.fyo.singles.AccountingSettings?.enable_inventory,
    barcode: () => !this.fyo.singles.InventorySettings?.enable_barcodes,
    has_batch: () => !this.fyo.singles.InventorySettings?.enable_batches,
    has_serial_number: () =>
      !this.fyo.singles.InventorySettings?.enable_serial_number,
    uom_conversions: () =>
      !this.fyo.singles.InventorySettings?.enable_uom_conversions,
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
        doc.track_item
          ? AccountRootTypeEnum.Liability
          : AccountRootTypeEnum.Expense,
      ],
    ],
  };

  static getActions(fyo: Fyo): Action[] {
    return [
      {
        group: fyo.t`Create`,
        label: fyo.t`Sales Invoice`,
        condition: (doc) => !doc.notInserted && doc.item_usage !== 'Purchases',
        action: async (doc, router) => {
          const invoice = await getMappedDoc(
            doc,
            ModelNameEnum.SalesInvoice,
            'make_sales_invoice'
          );
          await router.push(`/edit/SalesInvoice/${invoice.name!}`);
        },
      },
      {
        group: fyo.t`Create`,
        label: fyo.t`Purchase Invoice`,
        condition: (doc) => !doc.notInserted && doc.item_usage !== 'Sales',
        action: async (doc, router) => {
          const invoice = await getMappedDoc(
            doc,
            ModelNameEnum.PurchaseInvoice,
            'make_purchase_invoice'
          );
          await router.push(`/edit/PurchaseInvoice/${invoice.name!}`);
        },
      },
    ];
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'unit', 'tax', 'rate'],
    };
  }

  /** The documents that take all the items; the server refuses one kept for the other side. */
  static async getInvoiceSchemaNames(
    fyo: Fyo,
    names: string[]
  ): Promise<string[]> {
    const rows = await getFrappeRows(fyo, ModelNameEnum.Item, names, [
      'item_usage',
    ]);
    const usages = rows.map(({ item_usage }) => item_usage);
    const sales = [ModelNameEnum.SalesQuote, ModelNameEnum.SalesInvoice];
    return [
      ...(usages.includes('Purchases') ? [] : sales),
      ...(usages.includes('Sales') ? [] : [ModelNameEnum.PurchaseInvoice]),
    ];
  }
}
