import { computed, ref, shallowRef } from 'vue';

export type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** The Books logo the site declares (add_to_apps_screen in hooks.py). */
export function getAppIconUrl(): string {
  const books = window.frappe.boot?.app_data?.find(
    ({ app_name }) => app_name === 'frappe_books'
  );
  return books?.app_logo_url ?? '';
}

/** The browser's deferred install prompt, when it offers one. */
export const installPrompt = shallowRef<InstallPromptEvent | null>(null);

/** Whether the install sheet (src/mobile/InstallSheet.vue) is open. */
export const isInstallSheetOpen = ref(false);

/** Chrome offers a prompt; iOS Safari installs from its share sheet. */
export const canInstall = computed(
  () => !isInstalledApp() && (!!installPrompt.value || isIOS())
);

/** Books shows its own install sheet, so it keeps the browser's prompt. */
export function listenForInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt.value = event as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt.value = null;
  });
}

function isIOS(): boolean {
  const { userAgent, platform, maxTouchPoints } = navigator;
  // iPadOS reports a Mac platform with touch support.
  return (
    /iphone|ipad|ipod/i.test(userAgent) ||
    (platform === 'MacIntel' && maxTouchPoints > 1)
  );
}

function isInstalledApp(): boolean {
  const { standalone } = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    standalone === true
  );
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker
    .register('/books/sw.js', { scope: '/books/' })
    .catch((error) => console.error('Books could not install offline support.', error));
}
