import { t } from 'fyo';
import type { Doc } from 'fyo/model/doc';
import { BaseError } from 'fyo/utils/errors';
import { ErrorLog } from 'fyo/utils/types';
import { showDialog } from 'src/utils/interactive';
import { fyo } from './initFyo';
import { getErrorMessage } from './utils';
import type { DialogOptions, ToastOptions } from './utils/types';

function shouldNotStore(error: Error) {
  const shouldLog = (error as BaseError).shouldStore ?? true;
  return !shouldLog;
}

function getToastProps(errorLogObj: ErrorLog) {
  const props: ToastOptions = {
    message: errorLogObj.name ?? t`Error`,
    type: 'error',
  };

  return props;
}

export function getErrorLogObject(
  error: Error,
  more: Record<string, unknown>
): ErrorLog {
  const { name, stack, message, cause } = error;
  if (cause) {
    more.cause = cause;
  }

  const errorLogObj = { name, stack, message, more };

  fyo.errorLog.push(errorLogObj);

  return errorLogObj;
}

export async function handleError(
  logToConsole: boolean,
  error: Error,
  more: Record<string, unknown> = {},
  notifyUser = true
) {
  if (logToConsole) {
    // eslint-disable-next-line no-console
    console.error(error);
  }

  if (shouldNotStore(error)) {
    return;
  }

  const errorLogObj = getErrorLogObject(error, more);

  if (notifyUser) {
    const toastProps = getToastProps(errorLogObj);
    const { showToast } = await import('src/utils/interactive');
    showToast(toastProps);
  }
}

export async function handleErrorWithDialog(
  error: unknown,
  doc?: Doc,
  dontThrow?: boolean
) {
  if (!(error instanceof Error)) {
    return;
  }

  const errorMessage = getErrorMessage(error, doc);
  await handleError(false, error, { errorMessage, doc });

  const label = getErrorLabel(error);
  const options: DialogOptions = {
    title: label,
    detail: errorMessage,
    type: 'error',
  };

  await showDialog(options);
  if (dontThrow) {
    if (fyo.store.isDevelopment) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
    return;
  }

  throw error;
}

function getErrorLabel(error: Error) {
  const name = error.name;
  if (!name) {
    return t`Error`;
  }

  if (name === 'BaseError') {
    return t`Error`;
  }

  if (name === 'ValidationError') {
    return t`Validation Error`;
  }

  if (name === 'NotFoundError') {
    return t`Not Found`;
  }

  if (name === 'ForbiddenError') {
    return t`Forbidden Error`;
  }

  if (name === 'DuplicateEntryError') {
    return t`Duplicate Entry`;
  }

  if (name === 'LinkValidationError') {
    return t`Link Validation Error`;
  }

  if (name === 'MandatoryError') {
    return t`Mandatory Error`;
  }

  if (name === 'NotImplemented') {
    return t`Error`;
  }

  if (name === 'ToDebugError') {
    return t`Error`;
  }

  return t`Error`;
}
