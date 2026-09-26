type FrappeResponse<T> = {
  message?: T;
  exception?: string;
  _server_messages?: string;
};

export async function call<T>(method: string, args: unknown = {}): Promise<T> {
  const csrfToken = window.frappe?.csrf_token || window.csrf_token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (csrfToken) {
    headers['X-Frappe-CSRF-Token'] = csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(`/api/method/${method}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(args),
    });
  } catch {
    throw new Error(
      'Unable to reach the Frappe Books server. Check your connection and try again.'
    );
  }

  const payload = await getResponsePayload<T>(response);
  if (!response.ok || payload.exception) {
    throw new Error(getErrorMessage(payload, response));
  }
  return payload.message as T;
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
        user_info?: Record<string, { fullname?: string }>;
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
