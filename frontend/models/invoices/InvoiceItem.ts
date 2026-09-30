import { Fyo } from 'fyo';
import type { DocValue, DocValueMap } from 'fyo/core/types';
import type { Doc } from 'fyo/model/doc';
import {
  ChangeArg,
  CurrenciesMap,
  FiltersMap,
  HiddenMap,
  ValidationMap,
} from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { validateTransferUnit } from 'models/inventory/units';
import { ModelNameEnum } from 'models/types';
import type { Money } from 'pesa';
import type { Schema } from 'schemas/types';
import { FrappeDoc } from 'src/frappe/document';
import type { QueryFilter } from 'utils/db/types';
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
      'rate',
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
    tableFields: ['item', 'tax', 'qty', 'rate', 'amount'],
    noCreate: ['transfer_unit', 'unit', 'account'],
  };

  parentdoc?: Invoice;
  item?: string;
  rate?: Money;
  qty?: number;
  quantity?: number;
  transfer_quantity?: number;
  unit?: string;
  batch?: string;
  is_manual_rate?: boolean;
  is_free_item?: boolean;

  getCurrencies: CurrenciesMap = {};

  constructor(schema: Schema, data: DocValueMap, fyo: Fyo, convert = true) {
    super(schema, data, fyo, convert);
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

  /** What an edit asks of the server: a new price, the item's details or the other quantities. */
  followEdit(fieldname?: string) {
    if (fieldname === 'rate') {
      this.is_manual_rate = true;
    } else if (fieldname === 'item') {
      this.followItem();
    } else if (fieldname === 'transfer_unit') {
      this.is_manual_rate = false;
      this.leaveToServer(['rate', 'quantity']);
    } else if (fieldname && QUANTITY_FIELDS.includes(fieldname)) {
      this.followQuantity(fieldname);
    }
  }

  followItem() {
    this.is_manual_rate = false;
    this.leaveToServer(['rate', ...ITEM_DETAILS]);
    // The server names an empty purchase batch from the new item's series on save.
    if (!this.isSales) {
      this.batch = undefined;
    }
  }

  /** Signs the quantity as the invoice takes it; the server derives the other quantities. */
  followQuantity(fieldname: string) {
    const quantity = Math.abs(this[fieldname] as number);
    this[fieldname] = this.isReturn ? -quantity : quantity;
    if (fieldname === 'quantity') {
      this.leaveToServer(['qty', 'transfer_quantity']);
      return;
    }

    // Qty is the quantity in the transfer unit, as the item table shows it.
    this.qty = this.transfer_quantity = this[fieldname] as number;
    this.leaveToServer(['quantity']);
  }

  // Fields of features turned off in the settings. The DocType's depends_on hides the rest.
  hidden: HiddenMap = {
    item_discounted_total: () => !this.enableDiscounting,
    set_item_discount_amount: () => !this.enableDiscounting,
    item_discount_amount: () => !this.enableDiscounting,
    item_discount_percent: () => !this.enableDiscounting,
    batch: () => !this.fyo.singles.InventorySettings?.enableBatches,
    transfer_unit: () => !this.enableUomConversions,
    transfer_quantity: () => !this.enableUomConversions,
    unit_conversion_factor: () => !this.enableUomConversions,
  };

  get enableDiscounting(): boolean {
    return !!this.fyo.singles.AccountingSettings?.enableDiscounting;
  }

  get enableUomConversions(): boolean {
    return !!this.fyo.singles.InventorySettings?.enableUomConversions;
  }

  // The server checks these too; mirrored to show the message at the field.
  validations: ValidationMap = {
    transfer_unit: async (value: DocValue) =>
      await validateTransferUnit(
        { fyo: this.fyo, item: this.item, unit: this.unit },
        value as string
      ),
    qty: async (value: DocValue) => {
      if (this.batch) {
        await this.validateBatchQuantity(this.batch, value as number);
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

    const location = await this.fyo.db.getStockLocation(
      invoice.schemaName,
      !!invoice.is_pos
    );
    return location ?? undefined;
  }

  async validateBatchQuantity(batch: string, quantity: number) {
    if (
      !this.item ||
      !this.isSales ||
      this.isReturn ||
      !this.fyo.singles.InventorySettings?.enableBatches
    ) {
      return;
    }

    const available =
      (await this.fyo.db.getStockQuantity(
        this.item,
        await this.getStockLocation(),
        undefined,
        undefined,
        batch
      )) ?? 0;
    if (quantity > available) {
      throw new ValidationError(
        this.fyo
          .t`Batch ${batch} only has ${available} quantity available but ${quantity} is required`
      );
    }
  }

  // Items are Frappe-backed and filter by Frappe fieldnames; batches and units are read through the bridge.
  static override filters: FiltersMap = {
    item: (doc: Doc): QueryFilter => ({
      item_usage: ['not in', [doc.isSales ? 'Purchases' : 'Sales']],
    }),
    batch: async (doc: Doc): Promise<QueryFilter> => {
      const item = doc.item as string;
      if (!doc.isSales || doc.isReturn) {
        return { item };
      }

      const location = await (doc as InvoiceItem).getStockLocation();
      const rows = await doc.fyo.db.getStockQuantities(location, [item]);
      const batches = rows
        .filter((row) => row.batch && row.quantity > 0)
        .map((row) => row.batch as string);
      return { name: ['in', batches] };
    },
    transfer_unit: async (doc: Doc): Promise<QueryFilter> => {
      const item = doc.item as string;
      const conversions = await doc.fyo.db.getAll(
        ModelNameEnum.UOMConversionItem,
        { fields: ['uom'], filters: { parent: item } }
      );
      const unit = await doc.fyo.getValue(ModelNameEnum.Item, item, 'unit');
      const units = [...conversions.map(({ uom }) => uom), unit];
      return { name: ['in', units.filter(Boolean) as string[]] };
    },
  };

  static override createFilters: FiltersMap = {
    item: (doc: Doc) => ({ item_usage: doc.isSales ? 'Sales' : 'Purchases' }),
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
  };
}
