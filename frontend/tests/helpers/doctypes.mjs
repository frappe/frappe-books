import { readFileSync, readdirSync } from 'node:fs';

const appRoot = new URL('../../../frappe_books/', import.meta.url);

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

/** What frappe_books.meta.get_books_meta answers for the doctypes, from the DocType files. */
export function getBooksMeta(doctypes, placements = {}) {
  const metas = doctypes.flatMap(getMetaBundle);
  const byName = new Map(metas.map((meta) => [meta.name, meta]));
  return { metas: [...byName.values()], placements };
}

function getMeta(name) {
  const meta = [...doctypes, currencyMeta, countryMeta, printFormatMeta].find(
    (meta) => meta.name === name
  );
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

// Frappe's Country, which the app does not ship.
const countryMeta = {
  name: 'Country',
  autoname: 'field:country_name',
  translated_doctype: 1,
  permissions: [],
  fields: [
    {
      fieldname: 'country_name',
      fieldtype: 'Data',
      label: 'Country Name',
      reqd: 1,
    },
    { fieldname: 'date_format', fieldtype: 'Data', label: 'Date Format' },
    { fieldname: 'time_format', fieldtype: 'Data', label: 'Time format' },
    { fieldname: 'time_zones', fieldtype: 'Text', label: 'Time Zones' },
    { fieldname: 'code', fieldtype: 'Data', label: 'Code' },
  ],
};

// Frappe's Print Format, which the app does not ship; its builder fields are left out.
const printFormatMeta = {
  name: 'Print Format',
  autoname: 'Prompt',
  sort_field: 'creation',
  permissions: [],
  fields: [
    {
      fieldname: 'doc_type',
      fieldtype: 'Link',
      label: 'DocType',
      options: 'DocType',
      in_list_view: 1,
    },
    {
      fieldname: 'module',
      fieldtype: 'Link',
      label: 'Module',
      options: 'Module Def',
    },
    {
      fieldname: 'disabled',
      fieldtype: 'Check',
      label: 'Disabled',
      default: '0',
    },
    {
      fieldname: 'standard',
      fieldtype: 'Select',
      label: 'Standard',
      options: 'No\nYes',
      default: 'No',
      reqd: 1,
      no_copy: 1,
    },
    {
      fieldname: 'custom_format',
      fieldtype: 'Check',
      label: 'Custom Format',
      default: '0',
    },
    {
      fieldname: 'print_format_type',
      fieldtype: 'Select',
      label: 'Print Format Type',
      options: 'Jinja\nJS',
      default: 'Jinja',
    },
    { fieldname: 'html', fieldtype: 'Code', label: 'HTML', options: 'Jinja' },
    { fieldname: 'css_section', fieldtype: 'Section Break' },
    {
      fieldname: 'css',
      fieldtype: 'Code',
      label: 'Custom CSS',
      options: 'CSS',
    },
    {
      fieldname: 'custom_html_help',
      fieldtype: 'HTML',
      label: 'Custom HTML Help',
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
