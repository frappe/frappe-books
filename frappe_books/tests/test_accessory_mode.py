from contextlib import ExitStack
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.accessory import SETTINGS, accessory_company, forbid_in_accessory_mode
from frappe_books.boot import extend_bootinfo
from frappe_books.company import default_company
from frappe_books.permissions import has_app_permission
from frappe_books.tests import needs_erpnext

BOOKS_USER = "accessory-books-user@example.com"
# Modules that import the ERPNext check by name, so each needs its own patch
ERPNEXT_CHECKS = ("accessory", "boot", "frappe_books.doctype.books_erpnext_settings.books_erpnext_settings")
ACCESSORY_ON = patch("frappe_books.permissions.accessory_company", return_value="Acme")
ERPNEXT_SET_UP = patch("frappe_books.accessory.erpnext_setup_complete", return_value=True)


def without_erpnext():
	"""ERPNext as uninstalled, wherever Books asks."""
	stack = ExitStack()
	for module in ERPNEXT_CHECKS:
		stack.enter_context(patch(f"frappe_books.{module}.erpnext_installed", return_value=False))
	return stack


def forget_settings_and_books_setup():
	"""A site whose ERPNext settings were never saved and whose Books setup never ran."""
	frappe.db.delete("Singles", {"doctype": SETTINGS})
	frappe.db.set_single_value("Books Accounting Settings", "setup_complete", 0)


class IntegrationTestAccessoryMode(IntegrationTestCase):
	def test_accessory_mode_needs_erpnext(self):
		settings = frappe.get_single(SETTINGS)
		settings.update({"accessory_mode": 1, "default_company": None})
		with without_erpnext(), self.assertRaisesRegex(frappe.ValidationError, "Install ERPNext"):
			settings.save()

	def test_stored_mode_without_erpnext_is_standalone(self):
		frappe.db.set_single_value(SETTINGS, "accessory_mode", 1)
		with without_erpnext():
			self.assertIsNone(accessory_company())
			bootinfo = frappe._dict()
			extend_bootinfo(bootinfo)

		self.assertFalse(bootinfo.books["accessory_mode"])
		self.assertIsNone(bootinfo.books["erpnext"])
		self.assertEqual(bootinfo.books["company"], default_company())

	def test_books_writes_are_refused_in_accessory_mode(self):
		forbid_in_accessory_mode()
		with patch("frappe_books.accessory.accessory_company", return_value="Acme"):
			with self.assertRaisesRegex(frappe.ValidationError, "not available in accessory mode"):
				forbid_in_accessory_mode()

	def test_accessory_mode_opens_books_by_erpnext_rights(self):
		if not frappe.db.exists("User", BOOKS_USER):
			user = frappe.new_doc("User")
			user.update({"email": BOOKS_USER, "first_name": "Accessory", "send_welcome_email": 0})
			user.append("roles", {"role": "Books User"})
			user.insert(ignore_permissions=True)

		with self.set_user(BOOKS_USER):
			self.assertTrue(has_app_permission())
			with ACCESSORY_ON:
				self.assertFalse(has_app_permission())

	@needs_erpnext
	def test_first_load_without_books_setup_starts_in_accessory_mode(self):
		company = frappe.get_all("Company", pluck="name", limit=1)[0]
		forget_settings_and_books_setup()
		with ERPNEXT_SET_UP, patch("frappe_books.accessory.erpnext_default_company", return_value=company):
			bootinfo = frappe._dict()
			extend_bootinfo(bootinfo)

		self.assertTrue(bootinfo.books["accessory_mode"])
		self.assertEqual(bootinfo.books["company"], company)

	def test_a_chosen_company_keeps_standalone_without_books_setup(self):
		forget_settings_and_books_setup()
		frappe.db.set_single_value(SETTINGS, "default_company", "Acme")
		with patch("frappe_books.accessory.erpnext_installed", return_value=True), ERPNEXT_SET_UP:
			bootinfo = frappe._dict()
			extend_bootinfo(bootinfo)

		self.assertFalse(bootinfo.books["accessory_mode"])
