import { frappeModels } from 'models';
import { registerFrappeModels } from 'src/frappe/doctypes';
import { loadFrappeDocTypes } from 'src/frappe/registry';
import schemaMapping from '../../../../frappe_books/schema_mapping.json';

type DocField = { fieldname: string; fieldtype: string; options?: string };
type Meta = { name: string; fields: DocField[]; field_order?: string[] };
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

// Frappe's Currency, which the app does not ship.
const currencyMeta: Meta = {
  name: 'Currency',
  fields: [{ fieldname: 'currency_name', fieldtype: 'Data' }],
};

/**
 * Serves the Frappe-backed models from the DocType files and answers every
 * other request with `answer(path, body, params)`, as the server would.
 */
export async function loadFrappeFixture(answer: Answer) {
  (window as any).frappe = {
    boot: {
      books: { doctypes: getBootDoctypes() },
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
    const json = path.endsWith('getdoctype')
      ? { docs: getMetaBundle(body.doctype) }
      : await answer(path, body, params);
    return Response.json(json ?? {});
  };
  registerFrappeModels(frappeModels);
  await loadFrappeDocTypes();
}

/** Books schema names by doctype, as the boot sends them. */
function getBootDoctypes(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(schemaMapping.doctypes).map(([schemaName, { doctype }]) => [
      schemaName,
      doctype,
    ])
  );
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
  const meta = [...doctypes, currencyMeta].find((meta) => meta.name === name)!;
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
