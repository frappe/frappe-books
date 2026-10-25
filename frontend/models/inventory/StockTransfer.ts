import type { FiltersMap } from 'fyo/model/types';
import { addItem } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';

/** Delivery note and purchase receipt fields: links that offer no Create, and items edited in the row editor. */
export const transferFields = {
  ...withoutCreate(['return_against']),
  items: { edit: true },
};

/** The fields of a delivery note's or purchase receipt's files, as Books ordered them, after its party. */
export function getTransferFileFields(partyField: string): string[] {
  return [
    'name',
    'naming_series',
    partyField,
    'posting_date',
    'items',
    'grand_total',
    'terms',
    'return_against',
    'status',
  ];
}

/**
 * A shipment or purchase receipt, served by Frappe. Its `preview` fills the
 * number series, terms, row units, rates, warehouses and the grand total.
 */
export abstract class StockTransfer extends FrappeDoc {
  static override previewMethod = 'preview';
  static override partyField: string;

  get isSales() {
    return this.schemaName === ModelNameEnum.DeliveryNote;
  }

  get isReturn(): boolean {
    return !!this.return_against;
  }

  static filters: FiltersMap = {
    naming_series: (doc) => [['reference_type', '=', doc.schemaName]],
  };

  async addItem(name: string, quantity?: number) {
    return await addItem(name, this, quantity);
  }
}
