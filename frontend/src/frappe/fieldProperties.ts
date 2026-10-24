import type {
  DynamicLinkField,
  Field,
  FieldControl,
  FieldType,
  NumberField,
  OptionField,
  TargetField,
} from 'schemas/types';
import { isAccessoryMode } from './mode';

/** The DocField properties a field's data properties come from. */
export type DocFieldProperties = {
  fieldname: string;
  fieldtype: string;
  options?: string;
  reqd?: number;
  default?: string;
  read_only?: number;
  set_only_once?: number;
  non_negative?: number;
  max_value?: number;
  precision?: string;
  states?: Record<string, string>;
};

const numberFieldTypes = ['Int', 'Float', 'Currency'];
const booksFieldTypes: Record<string, FieldType | undefined> = {
  Attach: 'Attachment',
  'Attach Image': 'AttachImage',
  Autocomplete: 'AutoComplete',
  Code: 'Text',
  'Dynamic Link': 'DynamicLink',
  'Long Text': 'Text',
  'Small Text': 'Text',
  'Text Editor': 'Text',
  Percent: 'Float',
  // Rows of a link each, which /books edits as a table.
  'Table MultiSelect': 'Table',
  Time: 'Data',
  'Read Only': 'Data',
};
// The control each ERPNext field type shows in accessory mode.
const accessoryControls: Record<string, FieldControl | undefined> = {
  'Text Editor': 'TextEditor',
  'Table MultiSelect': 'TableMultiSelect',
  Time: 'Time',
  Percent: 'Percent',
  'Read Only': 'ReadOnly',
};

/** Whether a DocField holds rows, as Frappe's table fieldtypes do. */
export function isTableDocField(docfield: DocFieldProperties): boolean {
  return (
    booksFieldTypes[docfield.fieldtype] === 'Table' ||
    docfield.fieldtype === 'Table'
  );
}

/** A reference field holds a DocType name, which /books shows as a choice of doctypes. */
export function isReferenceField(docfield: DocFieldProperties): boolean {
  return docfield.fieldtype === 'Link' && docfield.options === 'DocType';
}

/** A field's data properties from its DocField, with the option labels the model gives. */
export function getFieldProperties(
  field: Field,
  docfield: DocFieldProperties
): Partial<Field> {
  const properties = {
    required: !!docfield.reqd,
    readOnly: !!docfield.read_only,
    setOnlyOnce: !!docfield.set_only_once,
  };
  if (isReferenceField(docfield)) {
    return { ...properties, default: docfield.default };
  }

  const fieldtype = booksFieldTypes[docfield.fieldtype] ?? docfield.fieldtype;
  return {
    ...properties,
    fieldtype,
    ...getControlProperties(docfield),
    // A Time's default, like "Now", is the server's to fill.
    default:
      docfield.fieldtype === 'Time'
        ? undefined
        : getDefault(fieldtype, docfield.default),
    ...getOptionProperties(field, fieldtype, docfield),
  } as Partial<Field>;
}

function getControlProperties(
  docfield: DocFieldProperties
): Partial<NumberField> {
  const control = isAccessoryMode()
    ? accessoryControls[docfield.fieldtype]
    : undefined;
  if (!control) {
    return {};
  }

  // An unset precision is Frappe's float precision.
  const precision = parseInt(docfield.precision ?? '');
  return control === 'Percent' && !Number.isNaN(precision)
    ? { control, precision }
    : { control };
}

function getOptionProperties(
  field: Field,
  fieldtype: string,
  docfield: DocFieldProperties
): Partial<OptionField | TargetField | DynamicLinkField | NumberField> {
  if (fieldtype === 'Link' || fieldtype === 'Table') {
    return { target: docfield.options };
  }

  if (fieldtype === 'DynamicLink') {
    return { references: docfield.options };
  }

  // A Color field's options are its palette.
  if (['Select', 'AutoComplete', 'Color'].includes(fieldtype)) {
    const labels = (field as OptionField).optionLabels ?? {};
    const lines = (docfield.options ?? '').split('\n');
    return {
      options: lines.filter(Boolean).map((value) => ({
        value,
        label: labels[value] ?? value,
      })),
      states: docfield.states,
      allowEmpty: lines.includes(''),
    };
  }

  if (numberFieldTypes.includes(fieldtype)) {
    // Frappe reads a max_value of 0 as no limit.
    return {
      minvalue: docfield.non_negative ? 0 : undefined,
      maxvalue: docfield.max_value || undefined,
    };
  }

  return {};
}

function getDefault(fieldtype: string, value: string | undefined) {
  // A default like ":Company", the user's default company, is the server's to fill.
  if (value === undefined || value.startsWith(':')) {
    return undefined;
  }

  if (fieldtype === 'Check') {
    return value === '1';
  }

  if (numberFieldTypes.includes(fieldtype)) {
    return Number(value);
  }

  return value;
}
