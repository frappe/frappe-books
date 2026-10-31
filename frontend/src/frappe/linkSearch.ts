import type { Filter } from './api';
import { getCompanyRow } from './companyRow';
import { getDocType } from './doctypes';
import type { FrappeDoc } from './document';
import { getScriptQuery } from './formScripts';
import type { DeskFilters, LinkSearch } from './link';

/**
 * How the Link `fieldname` of `doc` searches, as Desk's link control works it
 * out: a form script's `set_query` for the field. Undefined when there is none.
 */
export async function getLinkSearch(
  fieldname: string,
  doc: FrappeDoc
): Promise<LinkSearch | undefined> {
  const { form, key, row } = getQueryKey(fieldname, doc);
  const found = await getScriptQuery(form, key, row);
  if (!found) {
    return undefined;
  }

  return {
    query: found.query,
    filters: (found.filters && withoutEmpty(found.filters)) ?? null,
  };
}

/** A search's filters as a list, e.g. for the values of a record made from the link. */
export function toFilterList(filters: LinkSearch['filters']): Filter[] | null {
  if (!filters || Array.isArray(filters)) {
    return filters as Filter[] | null;
  }

  return Object.entries(filters).map(([fieldname, value]) =>
    Array.isArray(value)
      ? [fieldname, value[0] as string, value[1]]
      : [fieldname, '=', value]
  );
}

/**
 * The form the field's query is set on, and its key there: a row's is keyed
 * by its table, as `frm.set_query(field, table)` sets it. A field kept in a
 * per-company row searches as that row's field.
 */
function getQueryKey(
  fieldname: string,
  doc: FrappeDoc
): { form: FrappeDoc; key: string; row?: { cdt: string; cdn?: string } } {
  const table = doc.fieldMap[fieldname]?.companyTable;
  if (table) {
    const cdt = getTableDoctype(doc, table);
    const cdn = getCompanyRow(doc, table)?.name;
    return { form: doc, key: `${table}.${fieldname}`, row: { cdt, cdn } };
  }

  const { parentdoc, parentFieldname } = doc;
  if (parentdoc) {
    const row = { cdt: doc.doctype, cdn: doc.name };
    return { form: parentdoc, key: `${parentFieldname}.${fieldname}`, row };
  }

  return { form: doc, key: fieldname };
}

function getTableDoctype(doc: FrappeDoc, table: string): string {
  return getDocType(doc.schemaName).meta.fields.find(
    (field) => field.fieldname === table
  )!.options!;
}

/** A dict leaves out empty values, as Desk's `set_nulls` does. */
function withoutEmpty(filters: DeskFilters): DeskFilters {
  if (Array.isArray(filters)) {
    return filters;
  }

  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => !isEmpty(value))
  );
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}
