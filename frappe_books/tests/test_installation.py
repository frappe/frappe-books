"""Installation metadata regressions."""

from pathlib import Path

import frappe
from frappe.tests import IntegrationTestCase

import frappe_books
from frappe_books.hooks import app_icon_route, app_icon_title, app_icon_url
from frappe_books.setup import DEFAULT_PRINT_TEMPLATE_FIELDS, after_migrate, bootstrap
from frappe_books.tests.accounting import unique_name

POST_INSTALL_LINK_FIELDS = {
	"Books Pos Settings": ("inventory", "cash_account", "write_off_account", "default_account"),
	"Books Defaults": tuple(DEFAULT_PRINT_TEMPLATE_FIELDS),
}


class IntegrationTestInstallation(IntegrationTestCase):
	def test_apps_screen_uses_packaged_books_icon(self):
		apps_screen = frappe.get_hooks("add_to_apps_screen", app_name="frappe_books")
		self.assertEqual(
			apps_screen,
			[
				{
					"name": "frappe_books",
					"logo": app_icon_url,
					"title": app_icon_title,
					"route": app_icon_route,
					"has_permission": "frappe_books.permissions.has_app_permission",
					"sequence_id": 10,
				}
			],
		)
		self.assertEqual(frappe.get_hooks("app_logo_url", app_name="frappe_books"), [app_icon_url])
		self.assertTrue((Path(frappe_books.__file__).parent / "public" / "books-icon.png").is_file())

	def test_post_install_links_have_no_doctype_defaults(self):
		for doctype, fieldnames in POST_INSTALL_LINK_FIELDS.items():
			meta = frappe.get_meta(doctype)
			for fieldname in fieldnames:
				with self.subTest(doctype=doctype, fieldname=fieldname):
					self.assertFalse(meta.get_field(fieldname).default)

	def test_print_template_defaults_fill_empty_links(self):
		frappe.db.set_single_value("Books Defaults", dict.fromkeys(DEFAULT_PRINT_TEMPLATE_FIELDS))
		bootstrap()
		settings = frappe.get_single("Books Defaults")

		for fieldname, template_name in DEFAULT_PRINT_TEMPLATE_FIELDS.items():
			with self.subTest(fieldname=fieldname):
				self.assertEqual(settings.get(fieldname), template_name)

	def test_migrate_keeps_user_choices(self):
		template = frappe.get_doc(
			{
				"doctype": "Books Print Template",
				"name": unique_name("Custom Invoice"),
				"type": "SalesInvoice",
				"template": "<main>{{ doc.name }}</main>",
				"is_custom": 1,
			}
		).insert()
		frappe.db.set_single_value("Books Defaults", "sales_invoice_print_template", template.name)
		frappe.delete_doc("Books Uom", "Day")

		after_migrate()

		self.assertEqual(
			frappe.db.get_single_value("Books Defaults", "sales_invoice_print_template"), template.name
		)
		self.assertFalse(frappe.db.exists("Books Uom", "Day"))
