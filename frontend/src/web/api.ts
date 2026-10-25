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
import type { BootUserPermissions } from 'fyo/utils/permissions';
import { t } from 'fyo/utils/translation';
import type { DeskTheme } from 'src/utils/theme';
import type { ChartOfAccounts } from 'utils/types';
import { ref } from 'vue';

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

/** Browsers reject fetch with these messages when the network is down. */
const CONNECTION_FAILURE = /failed to fetch|load failed|networkerror/i;

const LOGIN_URL = `/login?redirect-to=${encodeURIComponent('/books')}`;

/** Whether the last request failed because the server could not be reached. */
export const hasLostConnection = ref(false);

/** Runs a whitelisted method; what the server logged besides its answer shows as Desk shows it. */
export async function call<T>(
  method: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const response = await reachServer(() =>
    fetch(`/api/method/${method}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(args),
    })
  );
  const body = (await response.json().catch(() => ({}))) as MethodResponse<T>;
  const messages = parseServerMessages(body._server_messages);
  if (!response.ok) {
    await leaveIfSessionExpired(response.status);
    throw getFailure(messages, body.exc_type, response.status, body.exc);
  }

  showServerMessages(messages);
  return body.message as T;
}

/** Runs a request and notes whether the server could be reached. */
export async function reachServer<T>(request: () => Promise<T>): Promise<T> {
  try {
    const response = await request();
    hasLostConnection.value = false;
    return response;
  } catch (error) {
    hasLostConnection.value = isConnectionFailure(error);
    throw error;
  }
}

/** One message the server logged, as Frappe's msgprint sends it; its HTML is the server's. */
export interface ServerMessage {
  message: string;
  title?: string;
  /** Desk shows an alert as a toast. */
  alert?: boolean | number;
  indicator?: string;
}

type MethodResponse<T> = {
  message?: T;
  exc_type?: string;
  /** The tracebacks, as a JSON list, when the server shows them to the user. */
  exc?: string;
  _server_messages?: string;
};

let messagesHandler: (messages: ServerMessage[]) => void = () => undefined;

/** Sets how the messages of a request that went through show, as Desk shows its toasts and message dialogs. */
export function onServerMessages(handler: (messages: ServerMessage[]) => void) {
  messagesHandler = handler;
}

/** Shows what a successful request logged. */
export function showServerMessages(messages: ServerMessage[] = []) {
  if (messages.length) {
    messagesHandler(messages);
  }
}

/** Frappe's `_server_messages`: a JSON list of JSON messages. */
function parseServerMessages(text?: string): ServerMessage[] {
  const messages = JSON.parse(text ?? '[]') as string[];
  return messages.map((message) => JSON.parse(message) as ServerMessage);
}

/**
 * The error of a failed request. Its alerts are dropped, as the request kept
 * nothing they announce; an error with no message of its own, like a
 * TypeError, says what failed.
 */
export function getFailure(
  messages: ServerMessage[],
  excType?: string,
  status?: number,
  traceback?: string
): Error {
  const shown = messages.filter(({ alert }) => !alert);
  if (!shown.length) {
    shown.push(getUnexplainedFailure(excType, traceback));
  }

  const message = shown.map((m) => m.message).join('\n');
  return getServerError(message, excType, status, shown);
}

/** Desk shows the traceback of an error that has no message; /books its last line, when the server sends it. */
function getUnexplainedFailure(
  excType?: string,
  traceback?: string
): ServerMessage {
  const lines = (parseTraceback(traceback) ?? '').trim().split('\n');
  const lastLine = lines[lines.length - 1];
  const message =
    lastLine || t`The server ran into an error (${excType ?? 'Error'}).`;
  return { message, title: t`Server Error` };
}

/** v1 sends tracebacks as a JSON list; v2 one traceback. */
function parseTraceback(traceback?: string): string | undefined {
  try {
    return (JSON.parse(traceback ?? '') as string[])[0];
  } catch {
    return traceback;
  }
}

/**
 * A fyo error for a server error, so forms treat it like their own. It keeps
 * the server's messages, in server order, for forms that show them as sent.
 */
export function getServerError(
  message: string,
  excType?: string,
  status?: number,
  messages: ServerMessage[] = [{ message }]
): Error {
  const ServerError =
    errorClassByType[excType ?? ''] ?? errorClassByStatus[status ?? 0];
  const error = ServerError
    ? new ServerError(message, false)
    : new Error(message);
  return Object.assign(error, { serverMessages: messages });
}

/** The server's messages of an error, or its own message. */
export function getServerMessages(error: unknown): ServerMessage[] {
  const { serverMessages } = error as { serverMessages?: ServerMessage[] };
  if (serverMessages?.length) {
    return serverMessages;
  }

  const message = error instanceof Error ? error.message : String(error);
  return [{ message }];
}

/** Sends the user to log in, and back to Books after. */
export function redirectToLogin() {
  window.location.href = LOGIN_URL;
}

/**
 * Frappe answers 401 when the session has ended, and 403 once the session is
 * gone from the browser, as after a logout elsewhere. As in Desk, the user goes
 * to log in and the request never settles, so no error shows meanwhile.
 */
export async function leaveIfSessionExpired(status?: number): Promise<void> {
  if (status === 401 || (status === 403 && hasGuestCookie())) {
    redirectToLogin();
    await new Promise(() => {});
  }
}

/** Frappe deletes the `user_id` cookie, or sets it to Guest, when a session ends. */
function hasGuestCookie(): boolean {
  const cookies = new URLSearchParams(document.cookie.split('; ').join('&'));
  const user = cookies.get('user_id');
  return !user || user === 'Guest';
}

/** Any answer from the server, even an error, means the connection is back. */
export async function checkConnection(): Promise<void> {
  await call('frappe.ping').catch(() => undefined);
}

function isConnectionFailure(error: unknown): boolean {
  return error instanceof TypeError && CONNECTION_FAILURE.test(error.message);
}

/** Frappe's JSON request headers, with the session's CSRF token. */
export function getHeaders(): Record<string, string> {
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

declare global {
  interface Window {
    csrf_token?: string;
    frappe: {
      csrf_token?: string;
      boot?: {
        lang?: string;
        /** Added by the Books page from the user's language. */
        layout_direction?: 'ltr' | 'rtl';
        developer_mode?: number;
        versions?: Record<string, string | undefined>;
        user?: BootUserPermissions & { name?: string };
        user_info?: Record<string, { fullname?: string }>;
        time_zone?: { system: string; user?: string };
        /** The user's Frappe desk theme. */
        desk_theme?: DeskTheme;
        /** Frappe's system defaults, such as its number precisions. */
        sysdefaults?: {
          float_precision?: string;
          currency_precision?: string;
          number_format?: string;
          rounding_method?: string;
          time_format?: string;
        };
        /** Added by `frappe_books.boot.extend_bootinfo`. */
        books?: {
          country_code: string;
          /** The ERPNext company in accessory mode, else the one Books Company once the setup wizard has made it. */
          company: string | null;
          /** /books shows ERPNext documents of `company` instead of Books ones. */
          accessory_mode?: boolean;
          /** Accessory mode: ERPNext has companies besides `company`. */
          other_companies?: boolean;
          /** With ERPNext installed, whether its setup wizard is done; null without ERPNext. */
          erpnext?: { setup_complete: boolean } | null;
          charts_of_accounts: ChartOfAccounts[];
          indian_states: Record<string, string>;
          print_style: string;
        };
        app_data?: { app_name: string; app_logo_url?: string | null }[];
        docs?: { doctype: string; name: string; symbol?: string | null }[];
        [key: string]: unknown;
      };
    };
  }
}
