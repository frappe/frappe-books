import { ListsMap, ValidationMap } from 'fyo/model/types';
import { ValueError } from 'fyo/utils/errors';
import { FieldTypeEnum } from 'schemas/types';
import { FrappeDoc } from 'src/frappe/document';
import { getCustomFieldname } from 'src/frappe/schema';
import type { CustomForm } from './CustomForm';
import { getTargets } from './customizable';

/** A Books Custom Field row. Its Custom Field holds the definition; the row places it. */
export class CustomField extends FrappeDoc {
  static override presentation = {
    label: 'Custom Field',
    quickEditFields: [
      'label',
      'fieldname',
      'fieldtype',
      'is_required',
      'default',
      'options',
      'target',
      'references',
      'section',
      'tab',
    ],
    fields: {
      fieldtype: {
        optionLabels: {
          Datetime: 'Date Time',
          AutoComplete: 'Autocomplete',
          AttachImage: 'Attach Image',
          DynamicLink: 'Dynamic Link',
        },
      },
    },
  };

  declare parentdoc?: CustomForm;
  declare label?: string;
  declare fieldname?: string;
  declare fieldtype?: string;

  // The server checks these too; mirrored to show the message at the field.
  validations: ValidationMap = {
    fieldname: (value) => {
      const field = this.parentdoc?.parentFields[value as string];
      if (field && !field.isCustom) {
        throw new ValueError(
          this.fyo.t`Fieldname ${value as string} already exists for ${
            this.parentdoc!.formTitle
          }`
        );
      }

      const other = this.parentdoc?.custom_fields?.find(
        (row) => row.name !== this.name && row.fieldname === value
      );
      if (other) {
        throw new ValueError(
          this.fyo
            .t`Fieldname ${value as string} already used for Custom Field ${
            (other.idx ?? 0) + 1
          }`
        );
      }
    },
  };

  static lists: ListsMap = {
    target: (doc) => getTargets((doc as CustomField).fieldtype),
    references: (doc) => {
      // Frappe takes a Select or a DocType link, which /books shows as a Select.
      const row = doc as CustomField;
      const rows = (row.parentdoc?.custom_fields ?? []).filter(
        (other) =>
          other.fieldname &&
          other.label &&
          other.fieldtype === FieldTypeEnum.Select
      );
      // Saved rows are the form's custom fields; the rows list them.
      const fields = (row.parentdoc?.parentSchema?.fields ?? []).filter(
        (field) =>
          field.fieldname &&
          field.label &&
          !field.isCustom &&
          field.fieldtype === FieldTypeEnum.Select
      );
      return [
        ...rows.map((other) => ({
          value: getCustomFieldname(other.fieldname!),
          label: other.label!,
        })),
        ...fields.map((field) => ({
          value: field.fieldname,
          label: field.label,
        })),
      ];
    },
  };
}
