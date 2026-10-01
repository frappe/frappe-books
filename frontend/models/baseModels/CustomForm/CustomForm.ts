import { Fyo } from 'fyo';
import { HiddenMap, ListsMap, ListViewSettings } from 'fyo/model/types';
import { Field, Schema } from 'schemas/types';
import { FrappeDoc } from 'src/frappe/document';
import { getSchema } from 'src/frappe/registry';
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
    return getSchema(this.name ?? '') ?? null;
  }

  get parentFields(): Record<string, Field> {
    return getMapFromList(this.parentSchema?.fields ?? [], 'fieldname');
  }

  static lists: ListsMap = {
    name: () =>
      getCustomizableSchemas().map(({ name, label }) => ({
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
            return getSchema(schemaName)?.label ?? schemaName;
          },
        },
      ],
    };
  }

  hidden: HiddenMap = { custom_fields: () => !this.name };
}
