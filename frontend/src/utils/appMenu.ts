import { t } from 'fyo';
import type { DropdownOptions } from 'frappe-ui';
import { call } from 'src/web/api';
import { docsPathRef } from './refs';

export function getAppMenuItems(openShortcuts: () => void): DropdownOptions {
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
        {
          label: t`Keyboard Shortcuts`,
          icon: 'lucide-command',
          onClick: openShortcuts,
        },
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
