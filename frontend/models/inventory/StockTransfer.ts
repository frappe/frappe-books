import type { ChangeArg, FiltersMap } from 'fyo/model/types';
import { addItem, getMappedValues } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { FrappeDoc } from 'src/frappe/document';

/**
 * A shipment or purchase receipt, served by Frappe. Its `preview` fills the
 * number series, terms, row units, rates, locations and the grand total.
 */
export abstract class StockTransfer extends FrappeDoc {
  static override previewMethod = 'preview';
  /** The invoice a transfer is made from, and its mapper. */
  static invoiceSchemaName: ModelNameEnum;
  static invoiceMapper: string;

  get isSales() {
    return this.schemaName === ModelNameEnum.Shipment;
  }

  get isReturn(): boolean {
    return !!this.return_against;
  }

  static filters: FiltersMap = {
    party: (doc) => ({
      role: ['in', [doc.isSales ? 'Customer' : 'Supplier', 'Both']],
    }),
    number_series: (doc) => ({ reference_type: doc.schemaName }),
    back_reference: () => ({
      stockNotTransferred: ['!=', 0],
      submitted: true,
      cancelled: false,
    }),
  };

  static createFilters: FiltersMap = {
    party: (doc) => ({ role: doc.isSales ? 'Customer' : 'Supplier' }),
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

    const { invoiceSchemaName, invoiceMapper } = this
      .constructor as typeof StockTransfer;
    const mapped = this.toDocValues(
      await getMappedValues(
        invoiceSchemaName,
        this.back_reference as string,
        invoiceMapper
      )
    );
    await this.set('party', mapped.party);
    await this.set('return_against', mapped.return_against);
    await this.set('items', mapped.items);
  }
}
