import { getServerError, reachServer } from 'src/web/api';

/** A document or row as Frappe sends it: Frappe fieldnames and raw values. */
export type DocValues = Record<string, unknown>;

/** A Frappe list filter, `[fieldname, operator, value]`, or an `and`/`or` group of them. */
export type Filter = [string, string, unknown] | (Filter | 'and' | 'or')[];

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
  return (await request<DocValues>('PUT', path, { body: values })).data;
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
  const { docs } = await request('POST', ['method', 'run_doc_method'], {
    body: { method, document, kwargs },
  });
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
    const [error] = body.errors ?? [];
    const message = error?.message ?? error?.type ?? response.statusText;
    throw getServerError(message, error?.type, response.status);
  }

  return body;
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
