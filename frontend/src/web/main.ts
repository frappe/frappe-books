import { listenForInstallPrompt, registerServiceWorker } from './pwa';
import { useTranslations } from './translations';

async function start() {
  useTranslations(window.frappe?.boot?.__messages ?? {});
  // Load models and components after their static labels can be translated.
  await import('./mount');
}

listenForInstallPrompt();
registerServiceWorker();
void start();
