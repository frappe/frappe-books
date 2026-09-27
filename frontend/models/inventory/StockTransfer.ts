import { Doc } from 'fyo/model/doc';
import {
  ChangeArg,
  DefaultMap,
  FiltersMap,
  FormulaMap,
  HiddenMap,
} from 'fyo/model/types';
import { Invoice } from 'models/baseModels/Invoice/Invoice';
import { addItem, getMappedDoc, getNumberSeries } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { TargetField } from 'schemas/types';
import { StockTransferItem } from './StockTransferItem';
import { Transfer } from './Transfer';
import { createMissingBatches } from './helpers';

export abstract class StockTransfer extends Transfer {
  name?: string;
  date?: Date;
  party?: string;
  terms?: string;
  attachment?: string;
  grandTotal?: Money;
  backReference?: string;
  items?: StockTransferItem[];
  isReturned?: boolean;
  isFullyBilled?: boolean;
  returnAgainst?: string;

  get isSales() {
    return this.schemaName === ModelNameEnum.Shipment;
  }

  get isReturn(): boolean {
    return !!this.returnAgainst;
  }

  get enableDiscounting() {
    return !!this.fyo.singles?.AccountingSettings?.enableDiscounting;
  }

  get invoiceSchemaName() {
    if (this.isSales) {
      return ModelNameEnum.SalesInvoice;
    }
    return ModelNameEnum.PurchaseInvoice;
  }

  getGrandTotal() {
    // Receipts and shipments use their own stock rows, as the server does.
    return this.getSum('items', 'amount', false);
  }

  formulas: FormulaMap = {
    grandTotal: {
      formula: async () => await this.getGrandTotal(),
      dependsOn: ['items'],
    },
  };

  hidden: HiddenMap = {
    backReference: () =>
      !(this.backReference || !(this.isSubmitted || this.isCancelled)),
    terms: () => !(this.terms || !(this.isSubmitted || this.isCancelled)),
    attachment: () =>
      !(this.attachment || !(this.isSubmitted || this.isCancelled)),
    returnAgainst: () =>
      (this.isSubmitted || this.isCancelled) && !this.returnAgainst,
  };

  static defaults: DefaultMap = {
    numberSeries: (doc) => getNumberSeries(doc.schemaName, doc.fyo),
    terms: (doc) => {
      const defaults = doc.fyo.singles.Defaults;
      if (doc.schemaName === ModelNameEnum.Shipment) {
        return defaults?.shipmentTerms ?? '';
      }

      return defaults?.purchaseReceiptTerms ?? '';
    },
    date: () => new Date(),
  };

  static filters: FiltersMap = {
    party: (doc: Doc) => ({
      role: ['in', [doc.isSales ? 'Customer' : 'Supplier', 'Both']],
    }),
    numberSeries: (doc: Doc) => ({ referenceType: doc.schemaName }),
    backReference: () => ({
      stockNotTransferred: ['!=', 0],
      submitted: true,
      cancelled: false,
    }),
  };

  override async validate(): Promise<void> {
    await super.validate();
    await createMissingBatches(this);
  }

  override duplicate(): Doc {
    const doc = super.duplicate() as StockTransfer;
    doc.backReference = undefined;
    return doc;
  }

  static createFilters: FiltersMap = {
    party: (doc: Doc) => ({
      role: doc.isSales ? 'Customer' : 'Supplier',
    }),
  };

  async addItem(name: string, quantity?: number) {
    return await addItem(name, this, quantity);
  }

  override async change({ doc, changed }: ChangeArg): Promise<void> {
    if (doc.name === this.name && changed === 'backReference') {
      await this.setFieldsFromBackReference();
    }
  }

  async setFieldsFromBackReference() {
    const backReference = this.backReference;
    const { target } = this.fyo.getField(
      this.schemaName,
      'backReference'
    ) as TargetField;

    if (!backReference || !target) {
      return;
    }

    const brDoc = await this.fyo.doc.getDoc(target, backReference);
    if (!(brDoc instanceof Invoice)) {
      return;
    }

    const transfer = (await getMappedDoc(
      brDoc,
      this.schemaName,
      brDoc.stockTransferMapper
    )) as StockTransfer;
    await this.set('party', transfer.party);
    await this.set('returnAgainst', transfer.returnAgainst);
    await this.set('items', transfer.items);
  }
}
