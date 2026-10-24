from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.accessory import SETTINGS, accessory_company, forbid_in_accessory_mode
from frappe_books.boot import extend_bootinfo
from frappe_books.company import default_company
from frappe_books.permissions import has_app_permission

BOOKS_USER = "accessory-books-user@example.com"
WITHOUT_ERPNEXT = patch("frappe_books.accessory.erpnext_installed", return_value=False)
ACCESSORY_ON = patch("frappe_books.permissions.accessory_company", return_value="Acme")


class IntegrationTestAccessoryMode(IntegrationTestCase):
	def test_accessory_mode_needs_erpnext(self):
		settings = frappe.get_single(SETTINGS)
		settings.accessory_mode = 1
		with WITHOUT_ERPNEXT, self.assertRaisesRegex(frappe.ValidationError, "Install ERPNext"):
			settings.save()

	def test_stored_mode_without_erpnext_is_standalone(self):
		frappe.db.set_single_value(SETTINGS, "accessory_mode", 1)
		with WITHOUT_ERPNEXT:
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
