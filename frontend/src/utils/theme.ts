import type { ColorScheme } from 'frappe-ui';
import { call } from 'src/web/api';
import { ref } from 'vue';

export type DeskTheme = 'Light' | 'Dark' | 'Automatic';

const COLOR_SCHEMES: Record<DeskTheme, ColorScheme> = {
  Light: 'light',
  Dark: 'dark',
  Automatic: 'system',
};

/** The user's Frappe desk theme, which /books is painted in. */
export const deskTheme = ref<DeskTheme>('Light');

/** The color scheme of a desk theme; Automatic follows the system. */
export function getColorScheme(theme?: string): ColorScheme {
  return COLOR_SCHEMES[theme as DeskTheme] ?? 'light';
}

/** Sets the user's own desk theme in Frappe, which every user may do. */
export async function setDeskTheme(theme: DeskTheme) {
  deskTheme.value = theme;
  await call('frappe.core.doctype.user.user.switch_theme', { theme });
}
