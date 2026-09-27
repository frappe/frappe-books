import { TranslationString } from 'fyo/utils/translation';
import { getSchemas } from 'schemas';
import type { RawCustomField, SchemaMap } from 'schemas/types';
import { DatabaseDemuxBase, DatabaseMethod } from 'utils/db/types';
import { call } from './api';

export class FrappeDatabaseDemux extends DatabaseDemuxBase {
  async getSchemaMap(): Promise<SchemaMap> {
    const rawCustomFields = (await this.call('getAll', 'CustomField', {
      fields: [
        'parent',
        'label',
        'fieldname',
        'fieldtype',
        'isRequired',
        'section',
        'tab',
        'options',
        'target',
        'references',
        'default',
      ],
    })) as RawCustomField[];

    return getSchemas(
      window.books_boot?.country_code || '-',
      rawCustomFields,
      TranslationString.prototype.languageMap
    );
  }

  connect(countryCode?: string): Promise<string> {
    return Promise.resolve(
      countryCode || window.books_boot?.country_code || '-'
    );
  }

  async call(method: DatabaseMethod, ...args: unknown[]): Promise<unknown> {
    return call('frappe_books.ui_api.database_call', { method, args });
  }

  async callBespoke(method: string, ...args: unknown[]): Promise<unknown> {
    return call('frappe_books.ui_api.bespoke_call', { method, args });
  }

  override async runLifecycleAction(
    action: 'submit' | 'cancel',
    schemaName: string,
    name: string
  ): Promise<unknown> {
    return call('frappe_books.ui_api.lifecycle_action', {
      action,
      source_schema: schemaName,
      name,
    });
  }
}
