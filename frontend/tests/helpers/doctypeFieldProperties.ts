import type {
  DocFieldProperties,
  FieldPropertyMap,
} from '../../schemas/fieldProperties';

type DocField = DocFieldProperties & { fieldname: string };
type DocType = { name: string; fields: DocField[] };
type SchemaMapping = Record<
  string,
  { doctype: string; fields: Record<string, string> }
>;

const DATA_PROPERTIES = [
  'fieldtype',
  'options',
  'reqd',
  'default',
  'read_only',
  'set_only_once',
  'non_negative',
] as const;

/**
 * Field properties the server sends for these DocType files, named the way
 * `frappe_books/ui_bridge/field_properties.py` names them. Number series
 * prefixes come from `series.py`, so they are left out.
 */
export function getDoctypeFieldProperties(
  doctypes: DocType[],
  mapping: SchemaMapping
): FieldPropertyMap {
  const doctypeMap = Object.fromEntries(doctypes.map((d) => [d.name, d]));
  const schemaNames = Object.fromEntries(
    Object.entries(mapping).map(([schema, { doctype }]) => [doctype, schema])
  );
  const toSchema = (value?: string) => schemaNames[value ?? ''] ?? value;

  return Object.fromEntries(
    Object.entries(mapping).map(([schemaName, config]) => {
      const docfields = doctypeMap[config.doctype]?.fields ?? [];
      const properties: Record<string, DocFieldProperties> = {};
      for (const [source, target] of Object.entries(config.fields)) {
        const docfield = docfields.find((df) => df.fieldname === target);
        if (docfield) {
          properties[source] = getProperties(docfield, config.fields, toSchema);
        }
      }
      return [schemaName, properties];
    })
  );
}

function getProperties(
  docfield: DocField,
  fieldnames: Record<string, string>,
  toSchema: (value?: string) => string | undefined
): DocFieldProperties {
  const properties = Object.fromEntries(
    DATA_PROPERTIES.filter((key) => docfield[key]).map((key) => [
      key,
      docfield[key],
    ])
  ) as DocFieldProperties;

  if (['Link', 'Table'].includes(docfield.fieldtype)) {
    properties.options = toSchema(docfield.options);
  } else if (docfield.fieldtype === 'Dynamic Link') {
    properties.options = Object.keys(fieldnames).find(
      (source) => fieldnames[source] === docfield.options
    );
  }

  if (docfield.options === 'DocType' && docfield.default) {
    properties.default = toSchema(docfield.default);
  }
  return properties;
}
