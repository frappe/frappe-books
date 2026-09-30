import type {
  DynamicLinkField,
  Field,
  FieldType,
  NumberField,
  OptionField,
  SchemaMap,
  TargetField,
} from './types';

/** Data properties the server's DocType meta sets on a field. */
export type DocFieldProperties = {
  /** The DocType's own fieldname, for framework APIs. */
  fieldname: string;
  fieldtype: string;
  /** Custom fields only, as no schema file labels them. */
  label?: string;
  options?: string;
  reqd?: number;
  default?: string;
  read_only?: number;
  set_only_once?: number;
  non_negative?: number;
  states?: Record<string, string>;
};

/** Server field properties by schema name, then by field name. */
export type FieldPropertyMap = Record<
  string,
  Record<string, DocFieldProperties> | undefined
>;

/** Field properties the DocType owns. Schema files may not set them. */
export const dataProperties = [
  'frappeFieldname',
  'fieldtype',
  'options',
  'target',
  'references',
  'required',
  'default',
  'readOnly',
  'setOnlyOnce',
  'minvalue',
  'states',
] as const;

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

/** Overwrite each field's data properties with the server's. */
export function applyFieldProperties(
  schemaMap: SchemaMap,
  propertyMap: FieldPropertyMap
): void {
  for (const [schemaName, schema] of Object.entries(schemaMap)) {
    const properties = propertyMap[schemaName] ?? {};
    schema!.fields = schema!.fields.map((field) => {
      const docfield = properties[field.fieldname];
      if (!docfield || field.computed) {
        return field;
      }

      return { ...field, ...getFieldProperties(field, docfield) } as Field;
    });
  }
}

/** Reference fields hold a DocType name, which Books shows as its own type. */
export function isReferenceField(docfield: DocFieldProperties): boolean {
  return docfield.fieldtype === 'Link' && docfield.options === 'DocType';
}

function getFieldProperties(
  field: Field,
  docfield: DocFieldProperties
): Partial<Field> {
  const properties = {
    frappeFieldname: docfield.fieldname,
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

  if (fieldtype === 'Select' || fieldtype === 'AutoComplete') {
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
    return { minvalue: docfield.non_negative ? 0 : undefined };
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
