import { t } from 'fyo';
import type { FrappeDoc } from 'src/frappe/document';
import { BaseError, ConflictError } from 'fyo/utils/errors';
import { showDialog } from 'src/utils/interactive';
import { fyo } from './initFyo';
import { getErrorMessage } from './utils';
import type { DialogOptions, ToastOptions } from './utils/types';

function shouldNotStore(error: Error) {
  const shouldLog = (error as BaseError).shouldStore ?? true;
  return !shouldLog;
}

export async function handleError(
  logToConsole: boolean,
  error: Error,
  notifyUser = true
) {
  if (logToConsole) {
     
    console.error(error);
  }

  if (shouldNotStore(error)) {
    return;
  }

  if (notifyUser) {
    const toast: ToastOptions = {
      message: error.name ?? t`Error`,
      type: 'error',
    };
    const { showToast } = await import('src/utils/interactive');
    showToast(toast);
  }
}

export async function handleErrorWithDialog(
  error: unknown,
  doc?: FrappeDoc,
  dontThrow?: boolean
) {
  if (!(error instanceof Error)) {
    return;
  }

  const errorMessage = getErrorMessage(error, doc);
  await handleError(false, error);

  const label = getErrorLabel(error);
  const options: DialogOptions = {
    title: label,
    detail: errorMessage,
    type: 'error',
  };
  if (error instanceof ConflictError && doc?.inserted) {
    options.buttons = [
      { label: t`Reload`, action: () => doc.load(), isPrimary: true },
      { label: t`Cancel`, action: () => null, isEscape: true },
    ];
  }

  await showDialog(options);
  if (dontThrow) {
    if (fyo.store.isDevelopment) {
       
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
