import { t } from 'fyo';
import type { DropdownOptions } from 'frappe-ui';
import { call } from 'src/web/api';
import { docsPathRef } from './refs';
import { deskTheme, setDeskTheme, type DeskTheme } from './theme';

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
          label: t`Theme`,
          icon: 'lucide-sun-moon',
          submenu: getThemeItems(),
        },
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

function getThemeItems(): DropdownOptions {
  const themes: [DeskTheme, string][] = [
    ['Light', t`Light`],
    ['Dark', t`Dark`],
    ['Automatic', t`Automatic`],
  ];
  return themes.map(([theme, label]) => ({
    label,
    selected: deskTheme.value === theme,
    onClick: () => setDeskTheme(theme),
  }));
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
