"""Installation metadata regressions."""

from pathlib import Path

import frappe
from frappe.tests import IntegrationTestCase

import frappe_books
from frappe_books.hooks import app_icon_route, app_icon_title, app_icon_url
from frappe_books.printing import default_print_format, set_default_print_format
from frappe_books.regional import ensure_address_template
from frappe_books.setup import DEFAULT_PRINT_FORMATS, POS_PRINT_FORMAT, bootstrap

POST_INSTALL_LINK_FIELDS = {
	"Books POS Settings": ("warehouse", "cash_account", "write_off_account", "default_account"),
	"Books Defaults": ("pos_print_template",),
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

	def test_install_sets_the_default_print_formats(self):
		for doctype in DEFAULT_PRINT_FORMATS:
			set_default_print_format(doctype, None)
		frappe.db.set_single_value("Books Defaults", "pos_print_template", None)

		bootstrap()

		for doctype, print_format in DEFAULT_PRINT_FORMATS.items():
			with self.subTest(doctype=doctype):
				self.assertEqual(default_print_format(doctype), print_format)
		self.assertEqual(frappe.db.get_single_value("Books Defaults", "pos_print_template"), POS_PRINT_FORMAT)

	def test_install_keeps_chosen_print_formats(self):
		set_default_print_format("Books Sales Invoice", POS_PRINT_FORMAT)

		bootstrap()

		self.assertEqual(default_print_format("Books Sales Invoice"), POS_PRINT_FORMAT)

	def test_install_seeds_a_bank_mode_of_payment(self):
		frappe.delete_doc("Books Mode of Payment", "Bank")
		bootstrap()

		self.assertEqual(frappe.db.get_value("Books Mode of Payment", "Bank", "type"), "Bank")

	def test_setup_makes_a_default_address_template_once(self):
		frappe.db.delete("Address Template")
		ensure_address_template("India")
		ensure_address_template("Germany")
		self.assertEqual(frappe.get_all("Address Template", {"is_default": 1}, pluck="name"), ["India"])
		self.assertIn("{{ address_line1 }}", frappe.db.get_value("Address Template", "India", "template"))
