// The server stamps the build hash and inlines the icon, so each build installs a fresh worker.
const CACHE = "books-assets-__BUILD__";
const ASSETS = "/assets/frappe_books/books/assets/";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
	event.waitUntil(removeOldCaches().then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") return;

	if (request.mode === "navigate") {
		event.respondWith(fetch(request).catch(offlinePage));
		return;
	}

	const url = new URL(request.url);
	if (url.origin === location.origin && url.pathname.startsWith(ASSETS)) {
		event.respondWith(cacheFirst(request));
	}
});

async function removeOldCaches() {
	const names = await caches.keys();
	const old = names.filter((name) => name.startsWith("books-assets-") && name !== CACHE);
	await Promise.all(old.map((name) => caches.delete(name)));
}

async function cacheFirst(request) {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;

	const response = await fetch(request);
	if (response.ok) await cache.put(request, response.clone());
	return response;
}

function offlinePage() {
	const html = `<!doctype html>
<html lang="en">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Offline · Books</title>
<style>
	:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
	body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; text-align: center; }
	h1 { font-size: 18px; margin: 16px 0 8px; }
	p { margin: 0 0 20px; color: #7c7c7c; font-size: 14px; }
	button { font: inherit; font-size: 14px; padding: 8px 16px; border-radius: 8px; border: 0; background: #171717; color: #fff; }
	@media (prefers-color-scheme: dark) { button { background: #fff; color: #171717; } }
</style>
<main>
	<div style="width: 56px; margin: auto">__ICON__</div>
	<h1>You're offline</h1>
	<p>Books needs a connection. Your data is safe on the server.</p>
	<button onclick="location.reload()">Try again</button>
</main>
</html>`;
	return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
