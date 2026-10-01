import { frappeModels } from 'models';
import { registerFrappeModels } from 'src/frappe/doctypes';
import { loadFrappeDocTypes } from 'src/frappe/registry';

type DocField = {
  fieldname: string;
  fieldtype: string;
  options?: string;
  [property: string]: unknown;
};
type Meta = {
  name: string;
  fields: DocField[];
  field_order?: string[];
  autoname?: string;
};
type Answer = (
  path: string,
  body: Record<string, any>,
  params: Record<string, any>
) => unknown;

const doctypes = Object.values(
  import.meta.glob('../../../../frappe_books/frappe_books/doctype/*/*.json', {
    eager: true,
    import: 'default',
  })
) as Meta[];

// Frappe's doctypes that models name, which the app does not ship.
const frappeMetas: Meta[] = [
  {
    name: 'Currency',
    fields: [{ fieldname: 'currency_name', fieldtype: 'Data' }],
  },
  {
    name: 'Country',
    autoname: 'field:country_name',
    fields: [{ fieldname: 'country_name', fieldtype: 'Data' }],
  },
  {
    name: 'Print Format',
    autoname: 'Prompt',
    fields: [
      { fieldname: 'doc_type', fieldtype: 'Link', options: 'DocType' },
      { fieldname: 'standard', fieldtype: 'Select', options: 'No\nYes' },
      { fieldname: 'custom_format', fieldtype: 'Check' },
      { fieldname: 'html', fieldtype: 'Code' },
      { fieldname: 'css', fieldtype: 'Code' },
      { fieldname: 'disabled', fieldtype: 'Check' },
    ],
  },
];

/**
 * Serves the models from the DocType files, with `customFields` added by
 * doctype, and answers every other request with `answer(path, body, params)`,
 * as the server would.
 */
export async function loadFrappeFixture(
  answer: Answer,
  customFields: Record<string, DocField[]> = {}
) {
  (window as any).frappe = {
    boot: {
      books: {},
      user: { name: 'Administrator', roles: ['Books Manager'] },
      time_zone: { system: 'Asia/Kolkata' },
    },
  };
  window.fetch = async (input, init = {}) => {
    const url = new URL(String(input), window.location.href);
    const body = init.body ? JSON.parse(String(init.body)) : {};
    const params = Object.fromEntries(
      [...url.searchParams].map(([key, value]) => [key, parseParam(value)])
    );
    const path = decodeURIComponent(url.pathname);
    const json = path.endsWith('get_books_meta')
      ? { message: getBooksMeta(body.doctypes, customFields) }
      : await answer(path, body, params);
    return Response.json(json ?? {});
  };
  registerFrappeModels(frappeModels);
  await loadFrappeDocTypes();
}

/** What frappe_books.meta.get_books_meta sends: each doctype's meta and its tables', once each. */
function getBooksMeta(
  names: string[],
  customFields: Record<string, DocField[]>
) {
  const metas = new Map(
    names.flatMap(getMetaBundle).map((meta) => {
      const fields = [...meta.fields, ...(customFields[meta.name] ?? [])];
      return [meta.name, { ...meta, fields }];
    })
  );
  return { metas: [...metas.values()], placements: {} };
}

/** A doctype's meta and its tables' meta, as Frappe's getdoctype sends them. */
function getMetaBundle(name: string): Meta[] {
  const meta = getMeta(name);
  const tables = meta.fields
    .filter(({ fieldtype }) => fieldtype === 'Table')
    .map(({ options }) => getMeta(options!));
  return [meta, ...tables];
}

function getMeta(name: string): Meta {
  const meta = [...doctypes, ...frappeMetas].find((meta) => meta.name === name);
  if (!meta) {
    throw new Error(`The fixture has no meta for ${name}`);
  }

  const order = meta.field_order ?? [];
  const fields = [...meta.fields].sort(
    (a, b) => order.indexOf(a.fieldname) - order.indexOf(b.fieldname)
  );
  return { permissions: [], ...meta, fields } as Meta;
}

function parseParam(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
