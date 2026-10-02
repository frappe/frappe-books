app_name = "frappe_books"
app_title = "Books"
app_publisher = "Frappe Technologies Pvt. Ltd."
app_description = "Frappe Books for Frappe Framework"
app_email = "hello@frappe.io"
app_license = "agpl-3.0"
app_logo_url = "/assets/frappe_books/books-icon.png"
app_icon_url = app_logo_url
app_icon_title = app_title
app_icon_route = "/books"

# Send non-GET requests for this app's endpoints as native `application/json`
# bodies instead of form-encoded, per-key JSON-stringified values.
use_json_request_body = True

add_to_apps_screen = [
	{
		"name": app_name,
		"logo": app_icon_url,
		"title": app_icon_title,
		"route": app_icon_route,
		"has_permission": "frappe_books.permissions.has_app_permission",
		"sequence_id": 10,
	}
]

website_route_rules = [
	{"from_route": "/books/sw.js", "to_route": "books-service-worker"},
	{"from_route": "/books/<path:app_path>", "to_route": "books"},
]

page_renderer = ["frappe_books.pwa.ServiceWorkerPage"]
# A fresh site opens the Books setup wizard, which completes Frappe's setup too.
setup_wizard_url = "/books"

extend_bootinfo = "frappe_books.boot.extend_bootinfo"

jinja = {
	"methods": [
		"frappe_books.printing.get_print_settings",
		"frappe_books.printing.get_print_totals",
		"frappe_books.printing.books_format",
	]
}

after_install = "frappe_books.setup.bootstrap"
before_tests = [
	"frappe_books.setup.before_tests",
	"frappe_books.tests.accounting.enable_features",
	"frappe_books.tests.accounting.set_default_inventory_accounts",
]

scheduler_events = {
	"daily": ["frappe_books.commerce.loyalty.expire_programs_and_points"],
}

export_python_type_annotations = True
require_type_annotated_api_methods = True
