import { Fyo } from 'fyo';
import { HiddenMap, ListsMap, ListViewSettings } from 'fyo/model/types';
import { Field, Schema } from 'schemas/types';
import { FrappeDoc } from 'src/frappe/document';
import { getDoctypeLabel, getSchema, toSchemaName } from 'src/frappe/registry';
import type { Presentation } from 'src/frappe/schema';
import { getMapFromList } from 'utils/index';
import { CustomField } from './CustomField';
import { getCustomizableForms } from './customizable';

/**
 * Books Custom Form, served by Frappe. It is named after the DocType whose
 * form it customizes; its rows name DocTypes and Frappe fieldnames.
 */
export class CustomForm extends FrappeDoc {
  static override doctype = 'Books Custom Form';
  static override presentation: Presentation = {
    label: 'Custom Form',
    nameField: { label: 'Form Type', fieldtype: 'AutoComplete' },
    fields: { custom_fields: { edit: true } },
  };
  static override previewMethod = 'preview';
  static override rowModels = { custom_fields: CustomField };

  declare custom_fields?: CustomField[];

  get parentSchema(): Schema | null {
    return getSchema(toSchemaName(this.name ?? '') ?? '') ?? null;
  }

  override get formTitle(): string {
    return this.name ? getDoctypeLabel(this.name) : '';
  }

  get parentFields(): Record<string, Field> {
    return getMapFromList(this.parentSchema?.fields ?? [], 'fieldname');
  }

  static lists: ListsMap = {
    name: () => getCustomizableForms(),
  };

  static getListViewSettings(fyo: Fyo): ListViewSettings {
    return {
      columns: [
        {
          label: fyo.t`Form Type`,
          fieldname: 'name',
          fieldtype: 'AutoComplete',
          display(value) {
            return getDoctypeLabel(String(value ?? ''));
          },
        },
      ],
    };
  }

  hidden: HiddenMap = { custom_fields: () => !this.name };
}
