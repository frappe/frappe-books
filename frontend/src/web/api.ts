import { call as frappeCall, type FrappeResourceError } from 'frappe-ui';
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

export async function call<T>(
  method: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  try {
    return await reachServer(() => frappeCall<T>(method, args));
  } catch (error) {
    await leaveIfSessionExpired((error as FrappeResourceError).status);
    throw toBooksError(error);
  }
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

/** One message of a failed request, as the server logged it; its HTML is the server's. */
export interface ServerMessage {
  message: string;
  title?: string;
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

function toBooksError(error: unknown): unknown {
  if (!isServerError(error)) {
    return error;
  }

  return getServerError(
    error.messages.join('\n'),
    error.exc_type,
    error.status,
    error.messages.map((message) => ({ message }))
  );
}

function isServerError(error: unknown): error is FrappeResourceError {
  return (
    error instanceof Error &&
    Array.isArray((error as FrappeResourceError).messages)
  );
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
