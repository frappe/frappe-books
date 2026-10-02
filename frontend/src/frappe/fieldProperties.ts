import type {
  DynamicLinkField,
  Field,
  FieldType,
  NumberField,
  OptionField,
  TargetField,
} from 'schemas/types';

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
};

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
    default: getDefault(fieldtype, docfield.default),
    ...getOptionProperties(field, fieldtype, docfield),
  } as Partial<Field>;
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
    const values = (docfield.options ?? '').split('\n').filter(Boolean);
    return {
      options: values.map((value) => ({
        value,
        label: labels[value] ?? value,
      })),
      states: docfield.states,
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
  if (value === undefined) {
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
