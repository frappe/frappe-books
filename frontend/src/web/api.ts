import {
  call as frappeCall,
  type FrappeResourceError,
} from 'frappe-ui';
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

/** A fyo error for a server error, so forms treat it like their own. */
export function getServerError(
  message: string,
  excType?: string,
  status?: number
): Error {
  const ServerError =
    errorClassByType[excType ?? ''] ?? errorClassByStatus[status ?? 0];
  return ServerError ? new ServerError(message, false) : new Error(message);
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
    error.status
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
        /** Added by `frappe_books.boot.extend_bootinfo`. */
        books?: {
          country_code: string;
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
