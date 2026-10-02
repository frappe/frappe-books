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
  getBatchQuantity,
  getStockLocation,
  getStockQuantities,
} from 'models/inventory/availability';
import { getTransferUnitFilter } from 'models/inventory/stockRows';
import { validateTransferUnit } from 'models/inventory/units';
import { isHsnCodeHidden } from 'models/regionalModels/in/hsnCode';
import type { Money } from 'pesa';
import type { Field, Schema } from 'schemas/types';
import { FrappeDoc, type FrappeValueOptions } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import type { Invoice } from './Invoice';
import { setCurrencies } from './Invoice';

// The server fills these from the row's item.
const ITEM_DETAILS = [
  'item_code',
  'description',
  'unit',
  'transfer_unit',
  'tax',
  'hsn_code',
  'account',
];
const QUANTITY_FIELDS = ['qty', 'transfer_quantity', 'quantity'];

/**
 * An invoice or quote row. The server fills its item details, units, price
 * and amounts; the row only turns the user's edits into what the server reads.
 */
export class InvoiceItem extends FrappeDoc {
  static override presentation = {
    label: 'Invoice Item',
    quickEditFields: [
      'item',
      'account',
      'description',
      'hsn_code',
      'tax',
      'transfer_rate',
      'transfer_quantity',
      'transfer_unit',
      'batch',
      'serial_number',
      'quantity',
      'unit',
      'unit_conversion_factor',
      'amount',
      'set_item_discount_amount',
      'item_discount_amount',
      'item_discount_percent',
      'item_discounted_total',
      'item_taxed_total',
    ],
    tableFields: ['item', 'tax', 'qty', 'transfer_rate', 'amount'],
    fields: {
      ...withoutCreate(['transfer_unit', 'unit', 'account']),
      // The server computes it from the rate; an edit here sets the rate instead.
      transfer_rate: { readOnly: false },
    },
    // Without `qty`: the server sets it from the quantity.
    fileFields: [
      'item',
      'item_code',
      'description',
      'rate',
      'transfer_unit',
      'transfer_quantity',
      'unit',
      'batch',
      'serial_number',
      'quantity',
      'unit_conversion_factor',
      'account',
      'tax',
      'amount',
      'set_item_discount_amount',
      'item_discount_amount',
      'item_discount_percent',
      'item_discounted_total',
      'item_taxed_total',
      'hsn_code',
      'stock_not_transferred',
      'is_manual_rate',
    ],
  };
  // The server prices the row, turns a typed rate per transfer unit into the
  // rate, and derives the other quantities again.
  static override refills = {
    item: ['rate', ...ITEM_DETAILS],
    transfer_rate: ['rate'],
    transfer_unit: ['rate', 'quantity'],
    quantity: ['qty', 'transfer_quantity'],
    qty: ['quantity'],
    transfer_quantity: ['quantity'],
  };

  parentdoc?: Invoice;
  item?: string;
  rate?: Money;
  transfer_rate?: Money;
  amount?: Money;
  tax?: string;
  qty?: number;
  quantity?: number;
  transfer_quantity?: number;
  unit?: string;
  transfer_unit?: string;
  unit_conversion_factor?: number;
  batch?: string;
  serial_number?: string;
  set_item_discount_amount?: boolean;
  item_discount_amount?: Money;
  item_discount_percent?: number;
  is_manual_rate?: boolean;
  is_free_item?: boolean;
  pricing_rule?: string;

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

  /** A cleared tax goes empty, not null, as the server fills a missing one from the item. */
  override _getFrappeValue(field: Field, options: FrappeValueOptions) {
    if (field.fieldname === 'tax' && this.tax === '') {
      return '';
    }

    return super._getFrappeValue(field, options);
  }

  /** What an edit asks of the server besides its refills: a price of its own or the server's. */
  followEdit(fieldname?: string) {
    if (fieldname === 'rate' || fieldname === 'transfer_rate') {
      this.is_manual_rate = true;
    } else if (fieldname === 'item') {
      this.followItem();
    } else if (fieldname === 'transfer_unit') {
      this.is_manual_rate = false;
    } else if (fieldname && QUANTITY_FIELDS.includes(fieldname)) {
      this.followQuantity(fieldname);
    }
  }

  followItem() {
    this.is_manual_rate = false;
    // The server names an empty purchase batch from the new item's series on save.
    if (!this.isSales) {
      this.batch = undefined;
    }
  }

  /** Signs the quantity as the invoice takes it; the server derives the other quantities. */
  followQuantity(fieldname: string) {
    const quantity = Math.abs(this[fieldname] as number);
    this[fieldname] = this.isReturn ? -quantity : quantity;
    // Qty is the quantity in the transfer unit, as the item table shows it.
    if (fieldname !== 'quantity') {
      this.qty = this.transfer_quantity = this[fieldname] as number;
    }
  }

  // Fields of features turned off in the settings, and the rate per stock unit,
  // which the row shows per transfer unit. The DocType's depends_on hides the rest.
  hidden: HiddenMap = {
    rate: () => true,
    hsn_code: () => isHsnCodeHidden(this.fyo),
    item_discounted_total: () => !this.enableDiscounting,
    set_item_discount_amount: () => !this.enableDiscounting,
    item_discount_amount: () => !this.enableDiscounting,
    item_discount_percent: () => !this.enableDiscounting,
    batch: () => !this.fyo.singles.InventorySettings?.enable_batches,
    serial_number: () =>
      !this.fyo.singles.InventorySettings?.enable_serial_number,
    transfer_unit: () => !this.enableUomConversions,
    transfer_quantity: () => !this.enableUomConversions,
    unit_conversion_factor: () => !this.enableUomConversions,
  };

  get enableDiscounting(): boolean {
    return !!this.fyo.singles.AccountingSettings?.enable_discounting;
  }

  get enableUomConversions(): boolean {
    return !!this.fyo.singles.InventorySettings?.enable_uom_conversions;
  }

  // The server checks these too; mirrored to show the message at the field.
  validations: ValidationMap = {
    transfer_unit: async (value: DocValue) =>
      await validateTransferUnit(
        { item: this.item, unit: this.unit },
        value as string
      ),
    qty: async (value: DocValue) => {
      if (this.batch) {
        // Qty is in the transfer unit; the batch holds stock units.
        const quantity = (value as number) * (this.unit_conversion_factor || 1);
        await this.validateBatchQuantity(this.batch, quantity);
      }
    },
    batch: async (value: DocValue) => {
      if (value) {
        await this.validateBatchQuantity(value as string, this.quantity ?? 0);
      }
    },
  };

  /** Stock location a sale ships from, as the server picks it. */
  async getStockLocation(): Promise<string | undefined> {
    const invoice = this.parentdoc;
    if (!invoice) {
      return undefined;
    }

    return await getStockLocation(invoice.doctype, !!invoice.is_pos);
  }

  async validateBatchQuantity(batch: string, quantity: number) {
    if (
      !this.item ||
      !this.isSales ||
      this.isReturn ||
      !this.fyo.singles.InventorySettings?.enable_batches
    ) {
      return;
    }

    const location = await this.getStockLocation();
    const available = await getBatchQuantity(this.item, batch, location);
    if (quantity > available) {
      throw new ValidationError(
        this.fyo
          .t`Batch ${batch} only has ${available} quantity available but ${quantity} is required`
      );
    }
  }

  // Items, batches and units are Frappe-backed and filter by Frappe fieldnames.
  static override filters: FiltersMap = {
    item: (doc: FrappeDoc) => [
      ['item_usage', 'not in', [doc.isSales ? 'Purchases' : 'Sales']],
    ],
    batch: async (doc: FrappeDoc) => {
      const item = doc.item as string;
      if (!doc.isSales || doc.isReturn) {
        return [['item', '=', item]];
      }

      const location = await (doc as InvoiceItem).getStockLocation();
      const rows = await getStockQuantities(location, [item]);
      const batches = rows
        .filter((row) => row.batch && row.quantity > 0)
        .map((row) => row.batch as string);
      return [['name', 'in', batches]];
    },
    transfer_unit: getTransferUnitFilter,
  };

  static override createFilters: FiltersMap = {
    item: (doc: FrappeDoc) => [
      ['item_usage', '=', doc.isSales ? 'Sales' : 'Purchases'],
    ],
    // A new batch is of the row's item, not one of the batches in stock.
    batch: (doc: FrappeDoc) => [['item', '=', doc.item]],
  };
}

export class SalesInvoiceItem extends InvoiceItem {
  static override presentation = {
    ...InvoiceItem.presentation,
    label: 'Sales Invoice Item',
  };
}

export class PurchaseInvoiceItem extends InvoiceItem {
  static override presentation = {
    ...InvoiceItem.presentation,
    label: 'Purchase Invoice Item',
  };
}

export class SalesQuoteItem extends InvoiceItem {
  static override presentation = {
    ...InvoiceItem.presentation,
    label: 'Sales Quote Item',
    quickEditFields: InvoiceItem.presentation.quickEditFields.filter(
      (fieldname) => fieldname !== 'serial_number'
    ),
    fileFields: InvoiceItem.presentation.fileFields.filter(
      (fieldname) => fieldname !== 'serial_number'
    ),
  };
}
