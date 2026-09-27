"""Upgrade coverage for the Books module rename."""

import frappe
from frappe.model.rename_doc import rename_doc
from frappe.tests import IntegrationTestCase

from frappe_books.patches.rename_books_module import NEW_MODULE, OLD_MODULE, execute


class TestModuleRename(IntegrationTestCase):
	def test_renames_standard_module_and_preserves_records(self):
		cash = frappe.get_doc("Books Payment Method", "Cash").as_dict()
		rename_doc(
			"Module Def", NEW_MODULE, OLD_MODULE, validate=False, rebuild_search=False, show_alert=False
		)
		frappe.local.app_modules["frappe_books"] = [frappe.scrub(OLD_MODULE)]

		execute()

		self.assertFalse(frappe.db.exists("Module Def", OLD_MODULE))
		self.assertEqual(frappe.local.app_modules["frappe_books"], [frappe.scrub(NEW_MODULE)])
		self.assertEqual(
			frappe.db.get_value("Module Def", NEW_MODULE, ["module_name", "app_name", "custom"]),
			(NEW_MODULE, "frappe_books", 0),
		)
		for doctype, name in (
			("DocType", "Books Sales Invoice"),
			("Workspace", "Books"),
			("Print Format", "Frappe Books - Sales Invoice"),
		):
			with self.subTest(doctype=doctype):
				self.assertEqual(frappe.db.get_value(doctype, name, "module"), NEW_MODULE)
		self.assertEqual(frappe.get_doc("Books Payment Method", "Cash").as_dict(), cash)
		self.assertEqual(
			frappe.new_doc("Books Sales Invoice").__class__.__module__,
			"frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice",
		)

	def test_merges_an_existing_app_module(self):
		create_old_module()
		frappe.db.set_value("Print Format", "Frappe Books - Sales Invoice", "module", OLD_MODULE)

		execute()
		execute()

		self.assertFalse(frappe.db.exists("Module Def", OLD_MODULE))
		self.assertEqual(
			frappe.db.get_value("Print Format", "Frappe Books - Sales Invoice", "module"), NEW_MODULE
		)

	def test_leaves_a_fresh_install_unchanged(self):
		module = frappe.get_doc("Module Def", NEW_MODULE).as_dict()

		execute()
		execute()

		self.assertEqual(frappe.get_doc("Module Def", NEW_MODULE).as_dict(), module)
		self.assertFalse(frappe.db.exists("Module Def", OLD_MODULE))


class TestModuleRenameRejection(IntegrationTestCase):
	"""Runs alone because it leaves both modules in place until the class rollback."""

	def test_rejects_a_module_owned_by_another_app(self):
		create_old_module()
		frappe.db.set_value("Module Def", NEW_MODULE, "app_name", "frappe")

		with self.assertRaises(frappe.ValidationError):
			execute()

		self.assertTrue(frappe.db.exists("Module Def", OLD_MODULE))
		self.assertEqual(frappe.db.get_value("Module Def", NEW_MODULE, "app_name"), "frappe")


def create_old_module():
	frappe.get_doc(
		{"doctype": "Module Def", "module_name": OLD_MODULE, "app_name": "frappe_books", "custom": 0}
	).db_insert()
