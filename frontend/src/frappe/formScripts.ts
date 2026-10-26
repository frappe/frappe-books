import type { DocValue } from 'fyo/core/types';
import { DateTime } from 'luxon';
import type { EvalDoc } from './dependsOn';
import type { FrappeDoc } from './document';
import { getAllOpenFrappeDocs } from './documents';
import { getDocType } from './doctypes';
import { isTableDocField } from './fieldProperties';
import type { DeskFilters } from './link';

/**
 * Form scripts apps add to /books with the `books_doctype_js` hook, as
 * `doctype_js` adds them to Desk. A script calls
 * `books.ui.form.on(doctype, handlers)` with Desk's events: `setup` and
 * `refresh` get the form, a field's handler runs after the field changes,
 * and a table row's gets the row's doctype and name too. `locals[cdt][cdn]`
 * reads a row, as on Desk.
 *
 * `frm.doc` holds the document's current values and is read only; change
 * them with `frm.set_value` or `books.model.set_value`. `books.boot` is Desk's
 * `frappe.boot`, and `books.datetime` has Desk's `nowdate` and `now_time`.
 */

/** What a link's `set_query` gives: Desk's filters and maybe a whitelisted query method. */
export interface LinkQuery {
  query?: string;
  filters?: DeskFilters;
}

type GetQuery =
  | LinkQuery
  | ((doc: EvalDoc, cdt: string, cdn?: string) => LinkQuery | string | void);

type Handler = (frm: BooksForm, cdt?: string, cdn?: string) => unknown;

export interface BooksForm {
  doctype: string;
  readonly doc: EvalDoc;
  /** Desk's `frm.set_query(fieldname, getQuery)`, or `(fieldname, table, getQuery)` for a row's field. */
  set_query(
    fieldname: string,
    table: string | GetQuery,
    getQuery?: GetQuery
  ): void;
  set_value(fieldname: string, value: DocValue): Promise<void>;
}

interface FormState {
  frm: BooksForm;
  queries: Map<string, GetQuery>;
}

const sources = new Map<string, string>();
const handlers = new Map<string, Record<string, Handler>[]>();
const forms = new WeakMap<FrappeDoc, FormState>();

const books = {
  get boot(): unknown {
    return globalThis.window?.frappe?.boot;
  },
  datetime: {
    nowdate: () => DateTime.now().toISODate(),
    now_time: () => DateTime.now().toFormat('HH:mm:ss'),
  },
  ui: {
    form: {
      on(doctype: string, events: Record<string, Handler>) {
        handlers.set(doctype, [...(handlers.get(doctype) ?? []), events]);
      },
    },
  },
  model: {
    async set_value(
      cdt: string,
      cdn: string,
      fieldname: string,
      value: DocValue
    ) {
      await findDoc(cdt, cdn)?.set(fieldname, value);
    },
  },
};

/** Desk's `locals`: a document or row's values by doctype, then name. */
const locals = new Proxy(
  {},
  {
    get: (_, cdt: string) =>
      new Proxy(
        {},
        { get: (__, cdn: string) => findDoc(cdt, cdn)?.getEvalDoc() }
      ),
  }
);

/** Keeps the scripts the server sent by doctype; each runs when a form of its doctype first opens. */
export function addFormScripts(scripts: Record<string, string> = {}) {
  for (const [doctype, source] of Object.entries(scripts)) {
    sources.set(doctype, source);
  }
}

/** Opens the scripts' form of a document: `setup`, then `refresh`, once. */
export async function openForm(doc: FrappeDoc): Promise<FormState> {
  const open = forms.get(doc);
  if (open) {
    return open;
  }

  const form = makeForm(doc);
  forms.set(doc, form);
  for (const doctype of [doc.doctype, ...getTableDoctypes(doc)]) {
    runScript(doctype);
  }

  doc.on('afterSync', () => trigger(form, doc.doctype, 'refresh'));
  doc.on('afterSubmit', () => trigger(form, doc.doctype, 'refresh'));
  await trigger(form, doc.doctype, 'setup');
  await trigger(form, doc.doctype, 'refresh');
  return form;
}

/** Runs the handlers of a field of a document or row, after it changed. */
export async function triggerFieldChange(doc: FrappeDoc, fieldname: string) {
  const parent = doc.parentdoc ?? doc;
  if (!hasHandler(doc.doctype, fieldname) || !forms.has(parent)) {
    return;
  }

  const form = forms.get(parent)!;
  if (doc.parentdoc) {
    await trigger(form, doc.doctype, fieldname, doc.doctype, doc.name);
  } else {
    await trigger(form, doc.doctype, fieldname);
  }
}

/**
 * The `set_query` of a document's field, worked out: `key` names a row's
 * field as `table.fieldname`, with the row's doctype and name.
 */
export async function getScriptQuery(
  doc: FrappeDoc,
  key: string,
  row?: { cdt: string; cdn?: string }
): Promise<LinkQuery | undefined> {
  const { queries, frm } = await openForm(doc);
  const getQuery = queries.get(key);
  if (!getQuery) {
    return undefined;
  }

  if (typeof getQuery !== 'function') {
    return getQuery;
  }

  try {
    const found = getQuery(
      frm.doc,
      row?.cdt ?? doc.doctype,
      row?.cdn ?? doc.name
    );
    return typeof found === 'string' ? { query: found } : (found ?? {});
  } catch (error) {
    console.error(`The form script's query for ${key} failed`, error);
    return undefined;
  }
}

function makeForm(doc: FrappeDoc): FormState {
  const queries = new Map<string, GetQuery>();
  const frm: BooksForm = {
    doctype: doc.doctype,
    get doc() {
      return doc.getEvalDoc();
    },
    set_query(fieldname, table, getQuery) {
      if (getQuery === undefined) {
        queries.set(fieldname, table as GetQuery);
      } else {
        queries.set(`${table as string}.${fieldname}`, getQuery);
      }
    },
    async set_value(fieldname, value) {
      await doc.set(fieldname, value);
    },
  };
  return { frm, queries };
}

function runScript(doctype: string) {
  const source = sources.get(doctype);
  if (!source) {
    return;
  }

  sources.delete(doctype);
  try {
    new Function('books', 'locals', source)(books, locals);
  } catch (error) {
    console.error(`A form script of ${doctype} failed`, error);
  }
}

async function trigger(
  form: FormState,
  doctype: string,
  event: string,
  cdt?: string,
  cdn?: string
) {
  for (const events of handlers.get(doctype) ?? []) {
    try {
      await events[event]?.(form.frm, cdt, cdn);
    } catch (error) {
      console.error(`A form script's ${event} of ${doctype} failed`, error);
    }
  }
}

function hasHandler(doctype: string, event: string): boolean {
  return !!handlers.get(doctype)?.some((events) => events[event]);
}

function getTableDoctypes(doc: FrappeDoc): string[] {
  return getDocType(doc.schemaName)
    .meta.fields.filter(isTableDocField)
    .map(({ options }) => options!);
}

/** An open document, or a row of one, by doctype and name. */
function findDoc(doctype: string, name: string): FrappeDoc | undefined {
  for (const doc of getAllOpenFrappeDocs()) {
    if (doc.doctype === doctype && doc.name === name) {
      return doc;
    }

    for (const { fieldname } of doc.tableFields) {
      const rows = (doc.get(fieldname) ?? []) as FrappeDoc[];
      const row = rows.find((r) => r.doctype === doctype && r.name === name);
      if (row) {
        return row;
      }
    }
  }
}
