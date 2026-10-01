import { ConflictError } from 'fyo/utils/errors';
import type { DocPermissionMap } from 'fyo/utils/permissions';
import { t } from 'fyo/utils/translation';
import {
  call,
  getServerError,
  leaveIfSessionExpired,
  reachServer,
} from 'src/web/api';

/** A document or row as Frappe sends it: Frappe fieldnames and raw values. */
export type DocValues = Record<string, unknown>;

/** A Frappe list filter, `[fieldname, operator, value]`. */
export type Filter = [string, string, unknown];

export interface ListQuery {
  /** Fieldnames, or `{ table: [fieldnames] }` for a table's rows. */
  fields?: (string | Record<string, string[]>)[];
  filters?: Filter[];
  orderBy?: string;
  start?: number;
  limit?: number;
}

type ResponseBody<T> = {
  data: T;
  docs?: DocValues[];
  errors?: { type?: string; message?: string }[];
};

export async function getDocument(
  doctype: string,
  name: string
): Promise<DocValues> {
  return (await request<DocValues>('GET', ['document', doctype, name])).data;
}

export async function insertDocument(
  doctype: string,
  values: DocValues
): Promise<DocValues> {
  const { data } = await request<DocValues>('POST', ['document', doctype], {
    body: values,
  });
  return data;
}

/** Saves the whole document; its `modified` makes Frappe refuse a stale copy. */
export async function updateDocument(
  doctype: string,
  name: string,
  values: DocValues
): Promise<DocValues> {
  const path = ['document', doctype, name];
  const saving = request<DocValues>('PUT', path, { body: values });
  return (await checkLatest(doctype, name, saving)).data;
}

export async function deleteDocument(
  doctype: string,
  name: string
): Promise<void> {
  await request('DELETE', ['document', doctype, name]);
}

/**
 * Runs a whitelisted controller method, like `submit` or `preview`, on the
 * client's copy of a document. Frappe refuses a copy older than the saved one.
 */
export async function runDocMethod(
  method: string,
  document: DocValues,
  kwargs?: Record<string, unknown>
): Promise<DocValues> {
  const running = request('POST', ['method', 'run_doc_method'], {
    body: { method, document, kwargs },
  });
  const { docs } = await checkLatest(
    String(document.doctype),
    String(document.name),
    running
  );
  return docs![0];
}

export async function getDocuments(
  doctype: string,
  query: ListQuery
): Promise<DocValues[]> {
  const params = {
    fields: query.fields,
    filters: query.filters,
    order_by: query.orderBy,
    start: query.start,
    limit: query.limit,
  };
  const path = ['document', doctype];
  return (await request<DocValues[]>('GET', path, { params })).data;
}

/** A field's value of one document, or undefined when the document is not found. */
export async function getValue(
  doctype: string,
  name: string,
  fieldname: string
): Promise<unknown> {
  const [row] = await getDocuments(doctype, {
    fields: [fieldname],
    filters: [['name', '=', name]],
    limit: 1,
  });
  return row?.[fieldname];
}

/**
 * Documents as Frappe's list views and `getCount` match them: a blank value
 * is empty text, so `!=`, `not like` and `<` match it, unlike in `getDocuments`.
 */
export async function getList(
  doctype: string,
  query: ListQuery & { orFilters?: Filter[] }
): Promise<DocValues[]> {
  return await call<DocValues[]>('frappe.client.get_list', {
    doctype,
    fields: query.fields,
    filters: query.filters,
    or_filters: query.orFilters,
    order_by: query.orderBy,
    limit_start: query.start,
    limit_page_length: query.limit,
  });
}

/** Every document that matches, newest first unless ordered; for short lists, like payment methods. */
export async function getAllDocuments(
  doctype: string,
  query: Pick<ListQuery, 'fields' | 'filters' | 'orderBy'>
): Promise<DocValues[]> {
  const orderBy = query.orderBy ?? 'creation desc';
  return await getList(doctype, { ...query, orderBy, limit: 0 });
}

/** The user's rights on one saved document, which shares, ownership and user permissions change. */
export async function getDocPermissions(
  doctype: string,
  name: string
): Promise<DocPermissionMap> {
  const { permissions } = await call<{ permissions: DocPermissionMap }>(
    'frappe.client.get_doc_permissions',
    { doctype, docname: name }
  );
  return permissions;
}

/** Counts the documents that match every filter and, if given, one of `orFilters`. */
export async function getCount(
  doctype: string,
  filters: Filter[],
  orFilters: Filter[]
): Promise<number> {
  const params = { filters, or_filters: orFilters };
  const path = ['doctype', doctype, 'count'];
  return (await request<number>('GET', path, { params })).data;
}

async function request<T>(
  method: string,
  path: string[],
  options: { body?: object; params?: Record<string, unknown> } = {}
): Promise<ResponseBody<T>> {
  const url = `/api/v2/${path.map(encodeURIComponent).join('/')}`;
  const response = await reachServer(() =>
    fetch(url + getQueryString(options.params), {
      method,
      headers: getHeaders(),
      body: options.body && JSON.stringify(options.body),
    })
  );

  const body = (await response.json()) as ResponseBody<T>;
  if (!response.ok) {
    await leaveIfSessionExpired(response.status);
    const [error] = body.errors ?? [];
    const message = error?.message ?? error?.type ?? response.statusText;
    throw getServerError(message, error?.type, response.status);
  }

  return body;
}

/** Frappe refuses a copy older than the saved one; /books says so in its own words. */
async function checkLatest<T>(
  doctype: string,
  name: string,
  response: Promise<T>
): Promise<T> {
  try {
    return await response;
  } catch (error) {
    if (error instanceof ConflictError) {
      const message = t`${doctype} ${name} changed after it was opened. Reload and try again.`;
      throw new ConflictError(message, false);
    }

    throw error;
  }
}

function getQueryString(params: Record<string, unknown> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }

  const text = query.toString();
  return text ? `?${text}` : '';
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Frappe-Site-Name': window.location.hostname,
  };
  const token = window.csrf_token;
  if (token && token !== '{{ csrf_token }}') {
    headers['X-Frappe-CSRF-Token'] = token;
  }

  return headers;
}
