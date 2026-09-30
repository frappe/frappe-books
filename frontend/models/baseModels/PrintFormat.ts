import { Fyo } from 'fyo';
import { Doc } from 'fyo/model/doc';
import {
  DefaultMap,
  ListsMap,
  ListViewSettings,
  ReadOnlyMap,
} from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { defaultPageSize, getPageCSS } from 'src/utils/printFormats';

/** Frappe's Print Format. /books edits the ones with custom HTML that no app ships. */
export class PrintFormat extends Doc {
  name?: string;
  docType?: string;
  html?: string;
  css?: string;
  standard?: 'Yes' | 'No';
  customFormat?: boolean;
  disabled?: boolean;

  get isEditable(): boolean {
    return this.standard !== 'Yes' && !!this.customFormat;
  }

  override get canDelete(): boolean {
    return this.standard !== 'Yes' && super.canDelete;
  }

  static defaults: DefaultMap = {
    docType: () => ModelNameEnum.SalesInvoice,
    customFormat: () => true,
    css: () => getPageCSS(defaultPageSize),
  };

  static getListViewSettings(fyo: Fyo): ListViewSettings {
    return {
      formRoute: (name) => `/template-builder/${name}`,
      columns: [
        'name',
        {
          label: fyo.t`Type`,
          fieldtype: 'AutoComplete',
          fieldname: 'docType',
          display(value) {
            return fyo.schemaMap[value as string]?.label ?? '';
          },
        },
        {
          label: fyo.t`Is Custom`,
          fieldtype: 'Check',
          fieldname: 'standard',
          display(value) {
            return fyo.format(value !== 'Yes', 'Check');
          },
        },
      ],
    };
  }

  readOnly: ReadOnlyMap = {
    name: () => !this.isEditable,
    docType: () => !this.isEditable,
    html: () => !this.isEditable,
  };

  static lists: ListsMap = {
    docType(doc?: Doc) {
      const models = [
        ModelNameEnum.SalesInvoice,
        ModelNameEnum.SalesQuote,
        ModelNameEnum.PurchaseInvoice,
        ModelNameEnum.JournalEntry,
        ModelNameEnum.Payment,
        ModelNameEnum.Shipment,
        ModelNameEnum.PurchaseReceipt,
        ModelNameEnum.StockMovement,
      ];

      return models.map((value) => ({
        value,
        label: doc?.fyo.schemaMap[value]?.label ?? value,
      }));
    },
  };
}
