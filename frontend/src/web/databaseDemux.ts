import { TranslationString } from 'fyo/utils/translation';
import { getSchemas } from 'schemas';
import type { FieldPropertyMap } from 'schemas/fieldProperties';
import type { RawCustomField, SchemaMap } from 'schemas/types';
import { DatabaseDemuxBase, DatabaseMethod, LinkedDoc } from 'utils/db/types';
import { call } from './api';

export class FrappeDatabaseDemux extends DatabaseDemuxBase {
  async getSchemaMap(): Promise<SchemaMap> {
    const [rawCustomFields, fieldProperties] = await Promise.all([
      this.getRawCustomFields(),
      this.getFieldProperties(),
    ]);

    return getSchemas(
      window.frappe?.boot?.books?.country_code || '-',
      rawCustomFields,
      fieldProperties,
      TranslationString.prototype.languageMap
    );
  }

  async getRawCustomFields(): Promise<RawCustomField[]> {
    return (await this.call('getAll', 'CustomField', {
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
  }

  getFieldProperties(): Promise<FieldPropertyMap> {
    return call('frappe_books.ui_api.get_field_properties');
  }

  connect(countryCode?: string): Promise<string> {
    return Promise.resolve(
      countryCode || window.frappe?.boot?.books?.country_code || '-'
    );
  }

  async call(method: DatabaseMethod, ...args: unknown[]): Promise<unknown> {
    return call('frappe_books.ui_api.database_call', { method, args });
  }

  async callBespoke(method: string, ...args: unknown[]): Promise<unknown> {
    return call('frappe_books.ui_api.bespoke_call', { method, args });
  }

  override async getDuplicate(
    schemaName: string,
    values: unknown
  ): Promise<unknown> {
    return call('frappe_books.ui_api.get_duplicate', {
      source_schema: schemaName,
      values,
    });
  }

  override async getDocPermissions(
    doctype: string,
    name: string
  ): Promise<unknown> {
    const { permissions } = await call<{ permissions: unknown }>(
      'frappe.client.get_doc_permissions',
      { doctype, docname: name }
    );
    return permissions;
  }

  override async runDocMethod(
    method: string,
    schemaName: string,
    values: unknown,
    name?: string
  ): Promise<unknown> {
    return call('frappe_books.ui_api.run_doc_method', {
      method,
      source_schema: schemaName,
      values,
      name,
    });
  }

  override async runLifecycleAction(
    action: 'submit' | 'cancel',
    schemaName: string,
    name: string,
    modified: string,
    linkedDocs?: LinkedDoc[]
  ): Promise<unknown> {
    return call('frappe_books.ui_api.lifecycle_action', {
      action,
      source_schema: schemaName,
      name,
      modified,
      linked_docs: linkedDocs,
    });
  }
}
