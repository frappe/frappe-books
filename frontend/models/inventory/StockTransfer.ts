import type { ChangeArg, FiltersMap } from 'fyo/model/types';
import { addItem } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { FrappeDoc } from 'src/frappe/document';
import { getMappedValues } from 'src/frappe/documents';
import { withoutCreate } from 'src/frappe/schema';

/** Delivery note and purchase receipt fields: links that offer no Create, and items edited in the row editor. */
export const transferFields = {
  ...withoutCreate(['back_reference', 'return_against']),
  items: { edit: true },
};

/** The fields of a delivery note's or purchase receipt's files, as Books ordered them, after its party. */
export function getTransferFileFields(partyField: string): string[] {
  return [
    'name',
    'naming_series',
    partyField,
    'date',
    'items',
    'grand_total',
    'terms',
    'attachment',
    'back_reference',
    'return_against',
    'status',
  ];
}

/**
 * A shipment or purchase receipt, served by Frappe. Its `preview` fills the
 * number series, terms, row units, rates, locations and the grand total.
 */
export abstract class StockTransfer extends FrappeDoc {
  static override previewMethod = 'preview';
  /** The invoice a transfer is made from, and its mapper. */
  static invoiceSchemaName: ModelNameEnum;
  static invoiceMapper: string;
  static override partyField: string;

  get isSales() {
    return this.schemaName === ModelNameEnum.DeliveryNote;
  }

  get isReturn(): boolean {
    return !!this.return_against;
  }

  static filters: FiltersMap = {
    naming_series: (doc) => [['reference_type', '=', doc.schemaName]],
    // Invoices with stock pending: a sale's pending quantity, a purchase's share received.
    back_reference: (doc) => [
      doc.isSales
        ? ['stock_not_transferred', '>', 0]
        : ['per_received', '<', 100],
      ['docstatus', '=', 1],
    ],
  };

  async addItem(name: string, quantity?: number) {
    return await addItem(name, this, quantity);
  }

  override async change(arg: ChangeArg) {
    await super.change(arg);
    if (arg.changed === 'back_reference') {
      await this.setFromBackReference();
    }
  }

  /** Takes the party, return and rows the picked invoice's mapper gives a transfer. */
  async setFromBackReference() {
    if (!this.back_reference) {
      return;
    }

    const { invoiceSchemaName, invoiceMapper, partyField } = this
      .constructor as typeof StockTransfer;
    const mapped = this.toDocValues(
      await getMappedValues(
        invoiceSchemaName,
        this.back_reference as string,
        invoiceMapper
      )
    );
    await this.set(partyField, mapped[partyField]);
    await this.set('return_against', mapped.return_against);
    await this.set('items', mapped.items);
  }
}
