import { Fyo } from 'fyo';
import type { DocValue, DocValueMap } from 'fyo/core/types';
import {
  ChangeArg,
  CurrenciesMap,
  FiltersMap,
  HiddenMap,
  ValidationMap,
} from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import {
  getBatchQuantities,
  getBatchQuantity,
  getStockLocation,
} from 'models/inventory/availability';
import { getTransferUnitFilter } from 'models/inventory/stockRows';
import { validateTransferUnit } from 'models/inventory/units';
import { isHsnCodeHidden } from 'models/regionalModels/in/hsnCode';
import type { Money } from 'pesa';
import type { Field, Schema } from 'schemas/types';
import { FrappeDoc, type FrappeValueOptions } from 'src/frappe/document';
import { isAccessoryMode } from 'src/frappe/mode';
import { withoutCreate } from 'src/frappe/schema';
import type { Invoice } from './Invoice';
import { setCurrencies } from './Invoice';

// The server fills these from the row's item.
const ITEM_DETAILS = [
  'item_name',
  'description',
  'stock_uom',
  'uom',
  'item_tax_template',
  'gst_hsn_code',
  'income_account',
  'expense_account',
];
const QUANTITY_FIELDS = ['qty', 'stock_qty'];
const QUICK_EDIT_FIELDS = withTypedRate([
  'item_code',
  'income_account',
  'expense_account',
  'description',
  'gst_hsn_code',
  'item_tax_template',
  'price_list_rate',
  'qty',
  'uom',
  'batch_no',
  'serial_no',
  'stock_qty',
  'stock_uom',
  'conversion_factor',
  'discount_percentage',
  'discount_amount',
  'amount',
]);
const FILE_FIELDS = [
  'item_code',
  'description',
  'price_list_rate',
  'uom',
  'qty',
  'stock_uom',
  'batch_no',
  'serial_no',
  'conversion_factor',
  'income_account',
  'expense_account',
  'item_tax_template',
  'amount',
  'discount_percentage',
  'discount_amount',
  'gst_hsn_code',
  'is_manual_rate',
];

/**
 * An invoice or quote row, priced as ERPNext prices one: per its unit, less
 * its discount. The server fills its item details, units, price and amounts;
 * the row only turns the user's edits into what the server reads.
 */
export class InvoiceItem extends FrappeDoc {
  static override presentation = {
    label: 'Invoice Item',
    quickEditFields: QUICK_EDIT_FIELDS,
    tableFields: withTypedRate([
      'item_code',
      'qty',
      'price_list_rate',
      'item_tax_template',
      'amount',
    ]),
    fields: withoutCreate([
      'uom',
      'stock_uom',
      'income_account',
      'expense_account',
    ]),
    fileFields: withTypedRate(FILE_FIELDS),
  };
  // The server prices the row and derives the other quantity again.
  static override refills = {
    item_code: ['price_list_rate', ...ITEM_DETAILS],
    uom: ['price_list_rate', 'conversion_factor', 'stock_qty'],
    qty: ['stock_qty'],
    stock_qty: ['qty'],
    discount_percentage: ['discount_amount'],
    discount_amount: ['discount_percentage'],
  };

  parentdoc?: Invoice;
  item_code?: string;
  item_name?: string;
  price_list_rate?: Money;
  rate?: Money;
  amount?: Money;
  item_tax_template?: string;
  qty?: number;
  stock_qty?: number;
  stock_uom?: string;
  uom?: string;
  conversion_factor?: number;
  batch_no?: string;
  serial_no?: string;
  discount_amount?: Money;
  discount_percentage?: number;
  is_manual_rate?: boolean;
  is_free_item?: boolean;
  pricing_rules?: string;

  getCurrencies: CurrenciesMap = {};

  constructor(schema: Schema, data: DocValueMap, fyo: Fyo) {
    super(schema, data, fyo);
    setCurrencies(this, () => this.parentdoc?.documentCurrency ?? '');
  }

  get isSales(): boolean {
    return !!this.parentdoc?.isSales;
  }

  get isReturn(): boolean {
    return !!this.parentdoc?.isReturn;
  }

  override async change(arg: ChangeArg) {
    await super.change(arg);
    this.followEdit(arg.changed);
  }

  /** A cleared template goes empty, not null, as the server fills a missing one from the item. */
  override _getFrappeValue(field: Field, options: FrappeValueOptions) {
    if (
      field.fieldname === 'item_tax_template' &&
      this.item_tax_template === ''
    ) {
      return '';
    }

    return super._getFrappeValue(field, options);
  }

  /** What an edit asks of the server besides its refills: a price of its own or the server's. */
  followEdit(fieldname?: string) {
    if (fieldname === 'price_list_rate') {
      this.is_manual_rate = true;
    } else if (fieldname === 'item_code') {
      this.followItem();
    } else if (fieldname === 'uom') {
      this.is_manual_rate = false;
    } else if (fieldname && QUANTITY_FIELDS.includes(fieldname)) {
      this.followQuantity(fieldname);
    }
  }

  followItem() {
    this.is_manual_rate = false;
    // The server names an empty purchase batch from the new item's series on save.
    if (!this.isSales) {
      this.batch_no = undefined;
    }
  }

  /** Signs the quantity as the invoice takes it; the server derives the other quantity. */
  followQuantity(fieldname: string) {
    const quantity = Math.abs(this[fieldname] as number);
    this[fieldname] = this.isReturn ? -quantity : quantity;
  }

  // Fields of features turned off in the settings. The DocType's depends_on hides the rest.
  hidden: HiddenMap = {
    gst_hsn_code: () => isHsnCodeHidden(this.fyo),
    discount_amount: () => !this.enableDiscounting,
    discount_percentage: () => !this.enableDiscounting,
    batch_no: () => !this.fyo.isFeatureOn('enable_batches'),
    serial_no: () => !this.fyo.isFeatureOn('enable_serial_number'),
    uom: () => !this.enableUomConversions,
    stock_qty: () => !this.enableUomConversions,
    conversion_factor: () => !this.enableUomConversions,
  };

  get enableDiscounting(): boolean {
    return this.fyo.isFeatureOn('enable_discounts_and_margin');
  }

  get enableUomConversions(): boolean {
    return this.fyo.isFeatureOn('enable_uom_conversions');
  }

  // The server checks these too; mirrored to show the message at the field.
  validations: ValidationMap = {
    uom: async (value: DocValue) =>
      await validateTransferUnit(
        { item: this.item_code, unit: this.stock_uom },
        value as string
      ),
    qty: async (value: DocValue) => {
      if (this.batch_no) {
        // Qty is in the row's unit; the batch holds stock units.
        const quantity = (value as number) * (this.conversion_factor || 1);
        await this.validateBatchQuantity(this.batch_no, quantity);
      }
    },
    batch_no: async (value: DocValue) => {
      if (value) {
        await this.validateBatchQuantity(value as string, this.stock_qty ?? 0);
      }
    },
  };

  /** Stock location a sale ships from, as the server picks it; an ERPNext row names its warehouse. */
  async getStockLocation(): Promise<string | undefined> {
    if (isAccessoryMode()) {
      return (this.warehouse as string | undefined) ?? undefined;
    }

    const invoice = this.parentdoc;
    if (!invoice) {
      return undefined;
    }

    return await getStockLocation(invoice.doctype, !!invoice.is_pos);
  }

  async validateBatchQuantity(batch: string, quantity: number) {
    if (
      !this.item_code ||
      !this.isSales ||
      this.isReturn ||
      !this.fyo.isFeatureOn('enable_batches')
    ) {
      return;
    }

    const location = await this.getStockLocation();
    const available = await getBatchQuantity(this.item_code, batch, location);
    if (quantity > available) {
      throw new ValidationError(
        this.fyo
          .t`Batch ${batch} only has ${available} quantity available but ${quantity} is required`
      );
    }
  }

  // Items, batches and units are Frappe-backed and filter by Frappe fieldnames.
  static override filters: FiltersMap = {
    batch_no: async (doc: FrappeDoc) => {
      const item = doc.item_code as string;
      if (!doc.isSales || doc.isReturn) {
        return [['item', '=', item]];
      }

      const location = await (doc as InvoiceItem).getStockLocation();
      const rows = await getBatchQuantities(item, location);
      const batches = rows
        .filter((row) => row.actual_qty > 0)
        .map((row) => row.batch_no as string);
      return [['name', 'in', batches]];
    },
    uom: getTransferUnitFilter,
  };

  static override createFilters: FiltersMap = {
    // A new batch is of the row's item, not one of the batches in stock.
    batch_no: (doc: FrappeDoc) => [['item', '=', doc.item_code]],
  };
}

export class SalesInvoiceItem extends InvoiceItem {
  static override presentation = {
    ...InvoiceItem.presentation,
    label: 'Sales Invoice Item',
    fileFields: getFileFields(['expense_account']),
  };
}

export class PurchaseInvoiceItem extends InvoiceItem {
  static override presentation = {
    ...InvoiceItem.presentation,
    label: 'Purchase Invoice Item',
    fileFields: getFileFields(['income_account']),
  };
}

// Quote rows have no account, batch or serial numbers.
const NOT_QUOTED = [
  'income_account',
  'expense_account',
  'batch_no',
  'serial_no',
];

export class QuotationItem extends InvoiceItem {
  static override presentation = {
    ...InvoiceItem.presentation,
    label: 'Quotation Item',
    quickEditFields: QUICK_EDIT_FIELDS.filter(
      (fieldname) => !NOT_QUOTED.includes(fieldname)
    ),
    fileFields: getFileFields(NOT_QUOTED),
  };
}

/** The row's file fields, less those its DocType lacks. */
function getFileFields(lacking: string[]): string[] {
  return withTypedRate(
    FILE_FIELDS.filter((fieldname) => !lacking.includes(fieldname))
  );
}

/**
 * Fields with the rate the user types: a Books row's price list rate, or an
 * ERPNext row's rate, as ERPNext reads the price list rate from the price list.
 */
function withTypedRate(fieldnames: string[]): string[] {
  return isAccessoryMode()
    ? fieldnames.map((fieldname) =>
        fieldname === 'price_list_rate' ? 'rate' : fieldname
      )
    : fieldnames;
}
