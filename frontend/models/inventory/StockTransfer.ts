import { DocValueMap } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import {
  ChangeArg,
  DefaultMap,
  FiltersMap,
  FormulaMap,
  HiddenMap,
} from 'fyo/model/types';
import { Defaults } from 'models/baseModels/Defaults/Defaults';
import { Invoice } from 'models/baseModels/Invoice/Invoice';
import { addItem, getNumberSeries } from 'models/helpers';
import { getReturnItems } from 'models/returnItems';
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

  async addItem(name: string) {
    return await addItem(name, this);
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

    const stDoc = await brDoc.getStockTransfer();
    if (!stDoc) {
      return;
    }

    await this.set('party', stDoc.party);
    await this.set('terms', stDoc.terms);
    await this.set('date', stDoc.date);
    await this.set('items', stDoc.items);
  }

  async getInvoice(): Promise<Invoice | null> {
    if (!this.isSubmitted || this.backReference) {
      return null;
    }

    const invoice = this.fyo.doc.getNewDoc(this.invoiceSchemaName, {
      party: this.party,
      date: new Date().toISOString(),
      ...this.getInvoiceDefaults(),
      backReference: this.name,
    }) as Invoice;
    for (const row of this.items ?? []) {
      if (row.item && row.quantity) {
        await invoice.append('items', {
          item: row.item,
          quantity: row.quantity,
          unit: row.unit,
          rate: row.rate ?? this.fyo.pesa(0),
          batch: row.batch || null,
          hsnCode: row.hsnCode,
          description: row.description,
        });
      }
    }

    return invoice.items?.length ? invoice : null;
  }

  getInvoiceDefaults() {
    const defaults = (this.fyo.singles.Defaults as Defaults) ?? {};
    if (this.isSales) {
      return {
        terms: defaults.salesInvoiceTerms ?? '',
        numberSeries: defaults.salesInvoiceNumberSeries ?? undefined,
      };
    }

    return {
      terms: defaults.purchaseInvoiceTerms ?? '',
      numberSeries: defaults.purchaseInvoiceNumberSeries ?? undefined,
    };
  }

  async getReturnDoc(): Promise<StockTransfer | undefined> {
    if (!this.name) {
      return;
    }

    const docData = this.getValidDict(true, true);
    const docItems = docData.items as DocValueMap[];

    if (!docItems) {
      return;
    }

    const balances = await this.fyo.db.getReturnBalanceItemsQty(
      this.schemaName,
      this.name
    );

    const returnDocData = {
      ...docData,
      name: undefined,
      date: new Date(),
      items: getReturnItems(docItems, balances),
      returnAgainst: docData.name,
    } as DocValueMap;

    const newReturnDoc = this.fyo.doc.getNewDoc(
      this.schema.name,
      returnDocData
    ) as StockTransfer;

    await newReturnDoc.runFormulas();
    return newReturnDoc;
  }
}
