import { readFileSync, readdirSync } from 'node:fs';

const appRoot = new URL('../../../frappe_books/', import.meta.url);

export const doctypes = readDoctypes(new URL('frappe_books/doctype/', appRoot));

/**
 * A doctype's meta and its tables' meta, with fields in field order, as
 * Frappe's getdoctype sends them. Currency, Country, Print Format, Address
 * and Dynamic Link are Frappe's own doctypes.
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
  const meta = [
    ...doctypes,
    currencyMeta,
    countryMeta,
    printFormatMeta,
    addressMeta,
    dynamicLinkMeta,
  ].find((meta) => meta.name === name);
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

// Frappe's Address, which the app does not ship.
const addressMeta = {
  name: 'Address',
  search_fields: 'country, state',
  permissions: [],
  fields: [
    {
      fieldname: 'address_details',
      fieldtype: 'Section Break',
      options: 'fa fa-map-marker',
    },
    { fieldname: 'address_title', fieldtype: 'Data', label: 'Address Title' },
    {
      fieldname: 'address_type',
      fieldtype: 'Select',
      label: 'Address Type',
      options:
        'Billing\nShipping\nOffice\nPersonal\nPlant\nPostal\nShop\nSubsidiary\nWarehouse\nCurrent\nPermanent\nOther',
      reqd: 1,
      in_list_view: 1,
    },
    {
      fieldname: 'address_line1',
      fieldtype: 'Data',
      label: 'Address Line 1',
      reqd: 1,
    },
    { fieldname: 'address_line2', fieldtype: 'Data', label: 'Address Line 2' },
    {
      fieldname: 'city',
      fieldtype: 'Data',
      label: 'City/Town',
      reqd: 1,
      in_list_view: 1,
    },
    { fieldname: 'county', fieldtype: 'Data', label: 'County' },
    { fieldname: 'state', fieldtype: 'Data', label: 'State/Province' },
    {
      fieldname: 'country',
      fieldtype: 'Link',
      label: 'Country',
      options: 'Country',
      reqd: 1,
    },
    { fieldname: 'pincode', fieldtype: 'Data', label: 'Postal Code' },
    { fieldname: 'column_break0', fieldtype: 'Column Break' },
    {
      fieldname: 'email_id',
      fieldtype: 'Data',
      label: 'Email Address',
      options: 'Email',
    },
    { fieldname: 'phone', fieldtype: 'Data', label: 'Phone', options: 'Phone' },
    { fieldname: 'fax', fieldtype: 'Data', label: 'Fax' },
    {
      fieldname: 'is_primary_address',
      fieldtype: 'Check',
      label: 'Preferred Billing Address',
      default: '0',
    },
    {
      fieldname: 'is_shipping_address',
      fieldtype: 'Check',
      label: 'Preferred Shipping Address',
      default: '0',
    },
    {
      fieldname: 'disabled',
      fieldtype: 'Check',
      label: 'Disabled',
      default: '0',
    },
    {
      fieldname: 'linked_with',
      fieldtype: 'Section Break',
      label: 'Reference',
      options: 'fa fa-pushpin',
    },
    {
      fieldname: 'links',
      fieldtype: 'Table',
      label: 'Links',
      options: 'Dynamic Link',
    },
  ],
};

// Frappe's Dynamic Link, which the app does not ship.
const dynamicLinkMeta = {
  name: 'Dynamic Link',
  istable: 1,
  permissions: [],
  fields: [
    {
      fieldname: 'link_doctype',
      fieldtype: 'Link',
      label: 'Link Document Type',
      options: 'DocType',
      reqd: 1,
      in_list_view: 1,
    },
    {
      fieldname: 'link_name',
      fieldtype: 'Dynamic Link',
      label: 'Link Name',
      options: 'link_doctype',
      reqd: 1,
      in_list_view: 1,
    },
    {
      fieldname: 'link_title',
      fieldtype: 'Read Only',
      label: 'Link Title',
      read_only: 1,
      in_list_view: 1,
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
