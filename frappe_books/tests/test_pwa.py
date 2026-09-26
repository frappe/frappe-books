from frappe.tests import IntegrationTestCase
from frappe.utils import set_request
from frappe.website.path_resolver import PathResolver
from frappe.website.serve import get_response_without_exception_handling

from frappe_books.pwa import ServiceWorkerPage


class IntegrationTestPWA(IntegrationTestCase):
	def test_service_worker_is_a_script_under_the_app_scope(self):
		set_request(method="GET", path="/books/sw.js")
		response = get_response_without_exception_handling()
		script = response.get_data(as_text=True)

		self.assertEqual(response.mimetype, "text/javascript")
		self.assertNotIn("__BUILD__", script)
		self.assertIn("<svg", script)

	def test_other_app_routes_still_open_books(self):
		set_request(method="GET", path="/books/list/SalesInvoice")
		endpoint, renderer = PathResolver("books/list/SalesInvoice").resolve()

		self.assertEqual(endpoint, "books")
		self.assertNotIsInstance(renderer, ServiceWorkerPage)
