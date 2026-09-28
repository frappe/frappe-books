import { t } from 'fyo';
import type { DropdownOptions } from 'frappe-ui';
import { call } from 'src/web/api';
import { docsPathRef } from './refs';

/** Phones have no keyboard shortcuts, so they pass no `openShortcuts`. */
export function getAppMenuItems(openShortcuts?: () => void): DropdownOptions {
  const shortcuts = openShortcuts
    ? [
        {
          label: t`Keyboard Shortcuts`,
          icon: 'lucide-command',
          onClick: openShortcuts,
        },
      ]
    : [];

  return [
    {
      group: t`Help`,
      hideLabel: true,
      options: [
        {
          label: t`Documentation`,
          icon: 'lucide-circle-help',
          onClick: openDocumentation,
        },
        ...shortcuts,
      ],
    },
    {
      group: t`Account`,
      hideLabel: true,
      options: [
        {
          label: t`Apps`,
          icon: 'lucide-layout-grid',
          onClick: () => window.location.assign('/apps'),
        },
        { label: t`Log Out`, icon: 'lucide-log-out', onClick: logOut },
      ],
    },
  ];
}

export function openDocumentation() {
  window.open(
    'https://docs.frappe.io/' + docsPathRef.value,
    '_blank',
    'noopener,noreferrer'
  );
}

async function logOut() {
  await call('logout');
  window.location.assign('/login');
}
