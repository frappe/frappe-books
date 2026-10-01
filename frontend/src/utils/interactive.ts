import { t } from 'fyo';
import { dialog, toast } from 'frappe-ui';
import { shallowRef } from 'vue';
import { renderSafeRichText } from './safeRichText';
import { DialogButton, DialogOptions, ToastOptions, ToastType } from './types';
import { isMobile } from './viewport';

export interface DialogSheetAction {
  label: string;
  variant: 'solid' | 'subtle';
  theme: 'gray' | 'red';
  onClick: () => Promise<void>;
}

export interface DialogSheet {
  title: string;
  detail?: string;
  actions: DialogSheetAction[];
  dismissible: boolean;
  onCancel: () => Promise<void>;
}

/** Phones show `showDialog` as a bottom sheet, rendered by DialogSheet.vue. */
export const dialogSheet = shallowRef<DialogSheet | null>(null);

export async function showDialog(options: DialogOptions) {
  const preWrappedButtons: DialogButton[] = options.buttons ?? [
    { label: t`Okay`, action: () => null, isEscape: true },
  ];

  return await new Promise((resolve, reject) => {
    let settled = false;
    const settleFromAction = async (config: DialogButton) => {
      if (settled) {
        return;
      }

      try {
        settled = true;
        resolve(await config.action());
      } catch (error) {
        settled = false;
        reject(error);
        throw error;
      }
    };
    const escapeButton =
      preWrappedButtons.find(({ isEscape }) => isEscape) ??
      (preWrappedButtons.length === 1 ? preWrappedButtons[0] : undefined);

    const settleFromDismiss = async () => {
      if (escapeButton) {
        await settleFromAction(escapeButton);
        return;
      }

      if (!settled) {
        settled = true;
        resolve(undefined);
      }
    };

    const actions = preWrappedButtons.map((config) => {
      return {
        label: config.label,
        theme: config.isPrimary ? ('gray' as const) : undefined,
        variant: config.isPrimary ? ('solid' as const) : ('subtle' as const),
        onClick: async () => await settleFromAction(config),
      };
    });

    const detail = Array.isArray(options.detail)
      ? options.detail.join('\n')
      : options.detail;
    const isDestructive = Boolean(
      options.destructive ||
        options.type === 'warning' ||
        options.type === 'error'
    );

    if (isMobile.value) {
      dialogSheet.value = {
        title: options.title,
        detail,
        actions: getSheetActions(
          preWrappedButtons,
          isDestructive,
          settleFromAction
        ),
        dismissible: Boolean(escapeButton),
        onCancel: settleFromDismiss,
      };
      return;
    }

    // Frappe UI renders `message` as a Vue child, although its public type
    // currently only declares strings. Passing a VNode lets us retain a
    // small safe formatting allowlist without using v-html.
    const message = detail
      ? (renderSafeRichText(detail) as unknown as string)
      : undefined;

    if (options.destructive) {
      const confirmButton = getPrimaryButton(preWrappedButtons);
      dialog.danger({
        title: options.title,
        message,
        confirmLabel: confirmButton.label,
        cancelLabel: escapeButton?.label,
        onConfirm: async () => await settleFromAction(confirmButton),
        onCancel: settleFromDismiss,
      });
      return;
    }

    dialog.confirm({
      title: options.title,
      message,
      theme: getDialogTheme(options.type),
      actions,
      dismissible: true,
      onCancel: settleFromDismiss,
    });
  });
}

export function showToast(options: ToastOptions) {
  const duration =
    options.duration === 'very_long'
      ? Infinity
      : {
          short: 2_500,
          long: 5_000,
        }[options.duration ?? 'long'];
  const toastOptions = {
    duration,
    action: options.actionText
      ? {
          label: options.actionText,
          onClick: options.action,
        }
      : undefined,
  };

  if (options.duration === 'very_long') {
    return toast.loading(options.message, toastOptions);
  }

  const type = options.type ?? 'info';
  if (type === 'success') {
    return toast.success(options.message, toastOptions);
  }
  if (type === 'error') {
    return toast.error(options.message, toastOptions);
  }
  if (type === 'warning') {
    return toast.warning(options.message, toastOptions);
  }

  return toast.info(options.message, toastOptions);
}

function getPrimaryButton(buttons: DialogButton[]): DialogButton {
  const button = buttons.find(({ isPrimary }) => isPrimary);
  if (!button) {
    throw new Error('A destructive dialog needs a primary button.');
  }
  return button;
}

function getSheetActions(
  buttons: DialogButton[],
  isDestructive: boolean,
  settle: (button: DialogButton) => Promise<void>
): DialogSheetAction[] {
  return buttons.map((button) => ({
    label: button.label,
    variant: button.isPrimary ? 'solid' : 'subtle',
    theme: button.isPrimary && isDestructive ? 'red' : 'gray',
    onClick: async () => await settle(button),
  }));
}

function getDialogTheme(
  type: ToastType | undefined
): 'blue' | 'amber' | 'red' | 'green' {
  const themeMap: Record<ToastType, 'blue' | 'amber' | 'red' | 'green'> = {
    info: 'blue',
    warning: 'amber',
    error: 'red',
    success: 'green',
  };
  return themeMap[type ?? 'info'];
}
