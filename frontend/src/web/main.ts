import { listenForInstallPrompt, registerServiceWorker } from './pwa';
import { loadTranslations } from './translations';

async function start() {
  try {
    await loadTranslations(window.frappe?.boot?.lang || 'en');
  } catch (error) {
    console.error(
      'Books will use English because translations could not be loaded.',
      error
    );
  }
  // Load models and components after their static labels can be translated.
  await import('./mount');
}

listenForInstallPrompt();
registerServiceWorker();
void start();
