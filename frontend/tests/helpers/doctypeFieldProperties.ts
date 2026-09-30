import type {
  DocFieldProperties,
  FieldPropertyMap,
} from '../../schemas/fieldProperties';

type DocType = {
  name: string;
  fields: DocFieldProperties[];
  istable?: number;
  search_fields?: string;
  show_name_in_global_search?: number;
  states?: { title: string; color: string }[];
};
type SchemaMapping = Record<
  string,
  {
    doctype: string;
    fields: Record<string, string>;
    print_formats?: Record<string, string>;
  }
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
      const doctype = doctypeMap[config.doctype];
      const docfields = doctype?.fields ?? [];
      const properties: Record<string, DocFieldProperties> = {};
      for (const [source, target] of Object.entries(config.fields)) {
        const docfield = docfields.find((df) => df.fieldname === target);
        if (docfield) {
          properties[source] = getProperties(docfield, config.fields, toSchema);
        }
      }
      // Customize Form's link to a DocType's default print format
      for (const source of Object.keys(config.print_formats ?? {})) {
        properties[source] = {
          fieldtype: 'Link',
          options: toSchema('Print Format'),
        };
      }
      if (properties.status && doctype?.states?.length) {
        properties.status.states = Object.fromEntries(
          doctype.states.map(({ title, color }) => [title, color])
        );
      }
      return [schemaName, properties];
    })
  );
}

function getProperties(
  docfield: DocFieldProperties,
  fieldnames: Record<string, string>,
  toSchema: (value?: string) => string | undefined
): DocFieldProperties {
  const properties = Object.fromEntries(
    DATA_PROPERTIES.filter((key) => docfield[key]).map((key) => [
      key,
      docfield[key],
    ])
  ) as DocFieldProperties;
  properties.fieldname = docfield.fieldname;

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

/**
 * The fields the search palette matches and shows, by schema, as
 * `frappe_books/boot.py` sends them from the DocType search fields.
 */
export function getDoctypeSearchFields(
  doctypes: DocType[],
  mapping: SchemaMapping
): Record<string, string[]> {
  const doctypeMap = Object.fromEntries(doctypes.map((d) => [d.name, d]));
  const searchFields: Record<string, string[]> = {};
  for (const [schemaName, config] of Object.entries(mapping)) {
    const doctype = doctypeMap[config.doctype];
    const targets = (doctype?.search_fields ?? '')
      .split(',')
      .map((fieldname) => fieldname.trim())
      .filter(Boolean);
    const fields = targets.map(
      (target) =>
        Object.keys(config.fields).find(
          (source) => config.fields[source] === target
        ) ?? target
    );
    if (doctype?.istable && fields.length) {
      searchFields[schemaName] = fields;
    } else if (fields.length || doctype?.show_name_in_global_search) {
      searchFields[schemaName] = ['name', ...fields];
    }
  }
  return searchFields;
}
