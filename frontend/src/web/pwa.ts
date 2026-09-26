export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker
    .register('/books/sw.js', { scope: '/books/' })
    .catch((error) => console.warn('Books could not install offline support.', error));
}
