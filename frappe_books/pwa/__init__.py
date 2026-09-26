import hashlib
from pathlib import Path

import frappe
from frappe.website.page_renderers.base_renderer import BaseRenderer
from werkzeug.wrappers import Response

SERVICE_WORKER_ROUTE = "books-service-worker"
SERVICE_WORKER = Path(__file__).with_name("service_worker.js")


class ServiceWorkerPage(BaseRenderer):
	"""Serve the service worker under /books/ so its scope covers the app."""

	def can_render(self):
		return self.path == SERVICE_WORKER_ROUTE

	def render(self):
		script = SERVICE_WORKER.read_text()
		script = script.replace("__BUILD__", get_build_hash()).replace("__ICON__", get_icon())
		response = Response(script, mimetype="text/javascript")
		response.headers["Cache-Control"] = "no-cache"
		return response


def get_build_hash() -> str:
	entry = Path(frappe.get_app_path("frappe_books", "public", "books", "index.html"))
	if not entry.exists():
		return "dev"
	return hashlib.sha256(entry.read_bytes()).hexdigest()[:12]


def get_icon() -> str:
	return Path(frappe.get_app_path("frappe_books", "public", "pwa", "icon.svg")).read_text()
