import { t } from 'fyo';
import { dialog, toast } from 'frappe-ui';
import { getColorClass } from './colors';
import { renderSafeRichText } from './safeRichText';
import { DialogButton, DialogOptions, ToastOptions, ToastType } from './types';

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

    dialog.confirm({
      title: options.title,
      // Frappe UI renders `message` as a Vue child, although its public type
      // currently only declares strings. Passing a VNode lets us retain a
      // small safe formatting allowlist without using v-html.
      message: detail
        ? (renderSafeRichText(detail) as unknown as string)
        : undefined,
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

export function getIconConfig(type: ToastType) {
  let iconName = 'alert-circle';
  if (type === 'warning') {
    iconName = 'alert-triangle';
  } else if (type === 'success') {
    iconName = 'check-circle';
  }

  const color = {
    info: 'blue',
    warning: 'orange',
    error: 'red',
    success: 'green',
  }[type];

  const iconColor = getColorClass(color ?? 'gray', 'text', 400);
  const containerBackground = getColorClass(color ?? 'gray', 'bg', 100);
  const containerBorder = getColorClass(color ?? 'gray', 'border', 300);

  return { iconName, color, iconColor, containerBorder, containerBackground };
}
