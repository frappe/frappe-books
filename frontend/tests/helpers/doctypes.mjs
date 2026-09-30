import { readFileSync, readdirSync } from 'node:fs';

const appRoot = new URL('../../../frappe_books/', import.meta.url);

export const mapping = readJson(
  new URL('schema_mapping.json', appRoot)
).doctypes;
export const doctypes = readDoctypes(new URL('frappe_books/doctype/', appRoot));

/**
 * A doctype's meta and its tables' meta, with fields in field order, as
 * Frappe's getdoctype sends them. Currency is Frappe's own doctype.
 */
export function getMetaBundle(name) {
  const meta = getMeta(name);
  const tables = meta.fields
    .filter((field) => field.fieldtype === 'Table')
    .map((field) => getMeta(field.options));
  return [meta, ...tables];
}

function getMeta(name) {
  const meta = [...doctypes, currencyMeta].find((meta) => meta.name === name);
  const order = meta.field_order ?? [];
  const fields = [...meta.fields].sort(
    (a, b) => order.indexOf(a.fieldname) - order.indexOf(b.fieldname)
  );
  return { permissions: [], ...meta, fields };
}

// Frappe's Currency, which the app does not ship.
const currencyMeta = {
  name: 'Currency',
  autoname: 'field:currency_name',
  permissions: [],
  fields: [
    {
      fieldname: 'currency_name',
      fieldtype: 'Data',
      label: 'Currency Name',
      reqd: 1,
    },
    {
      fieldname: 'enabled',
      fieldtype: 'Check',
      label: 'Enabled',
      default: '0',
    },
    { fieldname: 'fraction', fieldtype: 'Data', label: 'Fraction' },
    { fieldname: 'fraction_units', fieldtype: 'Int', label: 'Fraction Units' },
    {
      fieldname: 'smallest_currency_fraction_value',
      fieldtype: 'Currency',
      label: 'Smallest Currency Fraction Value',
    },
    { fieldname: 'symbol', fieldtype: 'Data', label: 'Symbol' },
    {
      fieldname: 'number_format',
      fieldtype: 'Select',
      label: 'Number Format',
      options: '\n#,###.##\n#.###,##',
    },
    {
      fieldname: 'symbol_on_right',
      fieldtype: 'Check',
      label: 'Show Currency Symbol on Right Side',
      default: '0',
    },
  ],
};

function readDoctypes(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('__'))
    .map(({ name }) => readJson(new URL(`${name}/${name}.json`, directory)));
}

function readJson(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

/**
 * The field properties the server sends for the DocType files, and schemas built with them.
 * A custom field's `docfield` stands for the properties of its Custom Field.
 */
export function withFieldProperties({
  getSchemas,
  getDoctypeFieldProperties,
  getDoctypeSearchFields,
}) {
  const fieldProperties = getDoctypeFieldProperties(doctypes, mapping);
  return {
    fieldProperties,
    searchFields: getDoctypeSearchFields?.(doctypes, mapping),
    getSchemas: (countryCode, customFields, properties = fieldProperties) =>
      getSchemas(
        countryCode,
        customFields,
        withCustomFields(properties, customFields)
      ),
  };
}

function withCustomFields(properties, customFields) {
  const merged = { ...properties };
  for (const { parent, fieldname, docfield } of customFields) {
    if (docfield) {
      merged[parent] = { ...merged[parent], [fieldname]: docfield };
    }
  }
  return merged;
}
