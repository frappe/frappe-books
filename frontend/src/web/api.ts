import {
  BaseError,
  ConflictError,
  DuplicateEntryError,
  ForbiddenError,
  LinkValidationError,
  MandatoryError,
  NotFoundError,
  ValidationError,
} from 'fyo/utils/errors';

type FrappeResponse<T> = {
  message?: T;
  exception?: string;
  exc_type?: string;
  _server_messages?: string;
};

type ErrorClass = new (message: string, shouldStore?: boolean) => BaseError;

const errorClassByType: Record<string, ErrorClass | undefined> = {
  DuplicateEntryError,
  LinkExistsError: LinkValidationError,
  MandatoryError,
  TimestampMismatchError: ConflictError,
};

const errorClassByStatus: Record<number, ErrorClass | undefined> = {
  403: ForbiddenError,
  404: NotFoundError,
  409: ValidationError,
  417: ValidationError,
};

export async function call<T>(method: string, args: unknown = {}): Promise<T> {
  return await post<T>(method, JSON.stringify(args), {
    'Content-Type': 'application/json',
  });
}

export async function uploadFile(file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file, file.name);
  body.append('is_private', '1');
  const uploaded = await post<{ file_url: string }>('upload_file', body);
  return uploaded.file_url;
}

async function post<T>(
  method: string,
  body: BodyInit,
  headers: Record<string, string> = {}
): Promise<T> {
  const csrfToken = window.frappe?.csrf_token || window.csrf_token;
  headers.Accept = 'application/json';
  if (csrfToken) {
    headers['X-Frappe-CSRF-Token'] = csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(`/api/method/${method}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body,
    });
  } catch {
    throw new Error(
      'Unable to reach the Frappe Books server. Check your connection and try again.'
    );
  }

  const payload = await getResponsePayload<T>(response);
  if (!response.ok || payload.exception) {
    throw getServerError(payload, response);
  }
  return payload.message as T;
}

function getServerError(
  payload: FrappeResponse<unknown>,
  response: Response
): Error {
  const message = getErrorMessage(payload, response);
  const ServerError =
    errorClassByType[payload.exc_type ?? ''] ??
    errorClassByStatus[response.status];
  return ServerError ? new ServerError(message, false) : new Error(message);
}

async function getResponsePayload<T>(
  response: Response
): Promise<FrappeResponse<T>> {
  const responseText = await response.text();
  if (!responseText.trim()) {
    if (response.ok) {
      return {};
    }

    throw new Error(getHttpErrorMessage(response));
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    if (!response.ok) {
      throw new Error(getHttpErrorMessage(response));
    }

    throw new Error(
      'The Frappe Books server returned an invalid response. Reload and try again.'
    );
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(
      'The Frappe Books server returned an invalid response. Reload and try again.'
    );
  }

  return payload as FrappeResponse<T>;
}

function getErrorMessage(
  payload: FrappeResponse<unknown>,
  response: Response
): string {
  if (payload._server_messages) {
    try {
      const messages = JSON.parse(payload._server_messages) as unknown;
      if (Array.isArray(messages)) {
        return messages.map(getServerMessage).join('\n');
      }
    } catch {
      return payload._server_messages;
    }
  }
  return payload.exception || getHttpErrorMessage(response);
}

function getHttpErrorMessage(response: Response): string {
  const status = [response.status, response.statusText]
    .filter(Boolean)
    .join(' ');

  if ([502, 503, 504].includes(response.status)) {
    return `The Frappe Books server is temporarily unavailable${status ? ` (${status})` : ''}. Try again.`;
  }

  return `The Frappe Books request failed${status ? ` (${status})` : ''}.`;
}

function getServerMessage(value: unknown): string {
  if (typeof value !== 'string') {
    return String(value);
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object') {
      const message = (parsed as Record<string, unknown>).message;
      if (typeof message === 'string') {
        return message;
      }
    }
  } catch {
    return value;
  }

  return value;
}

declare global {
  interface Window {
    csrf_token?: string;
    frappe: {
      csrf_token?: string;
      boot?: {
        lang?: string;
        user?: { name?: string };
        [key: string]: unknown;
      };
    };
    books_boot: {
      country_code: string;
      setup_complete: boolean;
      app_version: string;
      developer_mode: boolean;
    };
  }
}
