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
import type { PermissionMap } from 'fyo/utils/permissions';
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

/** Whether the last request failed because the server could not be reached. */
export const hasLostConnection = ref(false);

export async function call<T>(
  method: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  try {
    const response = await frappeCall<T>(method, args);
    hasLostConnection.value = false;
    return response;
  } catch (error) {
    hasLostConnection.value = isConnectionFailure(error);
    throw toBooksError(error);
  }
}

/** Any answer from the server, even an error, means the connection is back. */
export async function checkConnection(): Promise<void> {
  await call('frappe.ping').catch(() => undefined);
}

function isConnectionFailure(error: unknown): boolean {
  return error instanceof TypeError && CONNECTION_FAILURE.test(error.message);
}

/** Server errors become fyo errors, so forms treat them like their own. */
function toBooksError(error: unknown): unknown {
  if (!isServerError(error)) {
    return error;
  }

  const message = error.messages.join('\n');
  const ServerError =
    errorClassByType[error.exc_type ?? ''] ??
    errorClassByStatus[error.status ?? 0];
  return ServerError ? new ServerError(message, false) : new Error(message);
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
        developer_mode?: number;
        versions?: Record<string, string | undefined>;
        user?: BootUserPermissions & { name?: string };
        user_info?: Record<string, { fullname?: string }>;
        /** Added by `frappe_books.boot.extend_bootinfo`. */
        books?: {
          country_code: string;
          doctypes: Record<string, string>;
          search_fields: Record<string, string[]>;
          charts_of_accounts: ChartOfAccounts[];
          account_labels: Record<string, string>;
          indian_states: Record<string, string>;
        };
        [key: string]: unknown;
      };
    };
  }
}
