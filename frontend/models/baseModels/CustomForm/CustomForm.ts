import { Fyo } from 'fyo';
import { HiddenMap, ListsMap, ListViewSettings } from 'fyo/model/types';
import { Field, Schema } from 'schemas/types';
import { FrappeDoc } from 'src/frappe/document';
import type { Presentation } from 'src/frappe/schema';
import { getMapFromList } from 'utils/index';
import { CustomField } from './CustomField';
import { getCustomizableSchemas } from './customizable';

/**
 * Books Custom Form, served by Frappe. It is named after the schema whose
 * form it customizes; its rows name Books schemas and fields.
 */
export class CustomForm extends FrappeDoc {
  static override doctype = 'Books Custom Form';
  static override presentation: Presentation = {
    label: 'Custom Form',
    nameField: { label: 'Form Type', fieldtype: 'AutoComplete' },
  };
  static override previewMethod = 'preview';
  static override rowModels = { custom_fields: CustomField };

  declare custom_fields?: CustomField[];

  get parentSchema(): Schema | null {
    return this.fyo.schemaMap[this.name ?? ''] ?? null;
  }

  get parentFields(): Record<string, Field> {
    return getMapFromList(this.parentSchema?.fields ?? [], 'fieldname');
  }

  static lists: ListsMap = {
    name: (doc) =>
      getCustomizableSchemas(doc!.fyo).map(({ name, label }) => ({
        value: name,
        label: label!,
      })),
  };

  static getListViewSettings(fyo: Fyo): ListViewSettings {
    return {
      columns: [
        {
          label: fyo.t`Form Type`,
          fieldname: 'name',
          fieldtype: 'AutoComplete',
          display(value) {
            const schemaName = String(value ?? '');
            return fyo.schemaMap[schemaName]?.label ?? schemaName;
          },
        },
      ],
    };
  }

  hidden: HiddenMap = { custom_fields: () => !this.name };

  override async afterSync(): Promise<void> {
    await this.refreshParentSchema();
  }

  override async afterDelete(): Promise<void> {
    await this.refreshParentSchema();
  }

  /** Forms still served through the bridge show the new fields; see `loadFrappeDocTypes` for the rest. */
  async refreshParentSchema(): Promise<void> {
    if (!this.name) {
      return;
    }

    await this.fyo.db.refreshSchemaMap();
    this.fyo.doc.refreshSchema(this.name);
  }
}
