import { Fyo } from 'fyo';
import { DocValue } from 'fyo/core/types';
import {
  Action,
  FiltersMap,
  HiddenMap,
  LinkedRecords,
  ListViewSettings,
  ValidationMap,
} from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { getMappedDocAction } from 'models/helpers';
import { getItemPrices } from 'models/baseModels/ItemPrice/ItemPrice';
import { isHsnCodeHidden } from 'models/regionalModels/in/hsnCode';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import type { Field } from 'schemas/types';
import {
  getCompanyRowDescription,
  getCompanyRowValue,
  setCompanyRowValue,
} from 'src/frappe/companyRow';
import { FrappeDoc } from 'src/frappe/document';
import type { ClientField, Presentation } from 'src/frappe/schema';
import { ItemBarcode } from './ItemBarcode';
import {
  getExpenseAccountFilters,
  getIncomeAccountFilters,
  ItemDefault,
} from './ItemDefault';
import { ItemTax } from './ItemTax';
import { UOMConversionDetail } from './UOMConversionDetail';

const DEFAULT_FIELDNAMES = [
  'income_account',
  'expense_account',
  'default_warehouse',
];

/** A field of the current company's Item Defaults row, shown after the field `after`. */
function defaultField(
  fieldname: string,
  label: string,
  target: string,
  after: string
): ClientField {
  return {
    fieldname,
    fieldtype: 'Link',
    label,
    target,
    create: false,
    companyTable: 'item_defaults',
    after,
  } as ClientField;
}

/**
 * Books Item, served by Frappe. The DocType owns its fields, defaults and
 * rules; its `preview` fills accounts and fetched values while the user edits.
 */
export class Item extends FrappeDoc {
  static override doctype = 'Books Item';
  static override presentation: Presentation = {
    label: 'Item',
    quickEditFields: [
      'standard_rate',
      'stock_uom',
      'item_type',
      'taxes',
      'description',
      ...DEFAULT_FIELDNAMES,
      'barcodes',
      'gst_hsn_code',
      'is_stock_item',
    ],
    // The fields edit the current company's Item Defaults row.
    clientFields: [
      defaultField(
        'income_account',
        'Income Account',
        'Account',
        'item_defaults'
      ),
      defaultField(
        'expense_account',
        'Expense Account',
        'Account',
        'income_account'
      ),
      defaultField(
        'default_warehouse',
        'Default Warehouse',
        'Warehouse',
        'is_stock_item'
      ),
    ],
    fields: {
      item_defaults: { hidden: true },
      taxes: { emptyMessage: 'No taxes' },
      barcodes: { emptyMessage: 'No barcodes' },
    },
  };
  static override rowModels = {
    item_defaults: ItemDefault,
    taxes: ItemTax,
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

  static filters: FiltersMap = {
    income_account: () => getIncomeAccountFilters(),
    expense_account: (doc: FrappeDoc) => getExpenseAccountFilters(doc),
  };

  get income_account(): DocValue {
    return getCompanyRowValue(this, 'item_defaults', 'income_account');
  }

  set income_account(value: DocValue) {
    setCompanyRowValue(this, 'item_defaults', 'income_account', value);
  }

  get expense_account(): DocValue {
    return getCompanyRowValue(this, 'item_defaults', 'expense_account');
  }

  set expense_account(value: DocValue) {
    setCompanyRowValue(this, 'item_defaults', 'expense_account', value);
  }

  get default_warehouse(): DocValue {
    return getCompanyRowValue(this, 'item_defaults', 'default_warehouse');
  }

  set default_warehouse(value: DocValue) {
    setCompanyRowValue(this, 'item_defaults', 'default_warehouse', value);
  }

  /** The Item Defaults fields name their company, when ERPNext has others. */
  override getFormFields(fields: Field[]): Field[] {
    const description = getCompanyRowDescription(this);
    if (!description) {
      return fields;
    }

    return fields.map((field) =>
      field.companyTable ? { ...field, sub_label: description } : field
    );
  }

  // Fields of features turned off in the settings. The DocType's depends_on hides the rest.
  hidden: HiddenMap = {
    default_warehouse: () => !this.fyo.isFeatureOn('enable_inventory'),
    gst_hsn_code: () => isHsnCodeHidden(this.fyo),
    is_stock_item: () => !this.fyo.isFeatureOn('enable_inventory'),
    barcodes: () => !this.fyo.isFeatureOn('show_barcode_field'),
    has_batch_no: () => !this.fyo.isFeatureOn('enable_batches'),
    has_serial_no: () => !this.fyo.isFeatureOn('enable_serial_number'),
    uoms: () => !this.fyo.isFeatureOn('enable_uom_conversions'),
    item_group: () => !this.fyo.isFeatureOn('enable_item_group'),
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

  static override getLinkedRecords(fyo: Fyo): LinkedRecords | undefined {
    return getItemPrices(fyo, 'item_code', fyo.t`No item prices for this item`);
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'stock_uom', 'standard_rate'],
    };
  }
}
