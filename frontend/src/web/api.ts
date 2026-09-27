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
import type { PermissionMap } from 'fyo/utils/permissions';
import type { ChartOfAccounts } from 'utils/types';

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

export async function call<T>(
  method: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  try {
    return await frappeCall<T>(method, args);
  } catch (error) {
    throw toBooksError(error);
  }
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
      permissions: PermissionMap;
      charts_of_accounts: ChartOfAccounts[];
    };
  }
}
