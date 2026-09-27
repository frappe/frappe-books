# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account, unique_name


class IntegrationTestBooksAccount(IntegrationTestCase):
	def test_root_deletion_is_blocked_but_children_can_be_deleted(self):
		root = make_account("Protected Assets", is_group=1)
		child = make_account("Disposable Cash", parent_books_account=root.name)
		child.delete()
		with self.assertRaisesRegex(frappe.ValidationError, "Root.*cannot be deleted"):
			root.delete()
		self.assertTrue(frappe.db.exists(root.doctype, root.name))

	def test_root_group_can_be_created_and_edited_after_setup(self):
		frappe.db.set_single_value("Books Accounting Settings", "setup_complete", 1)
		root = make_account("Recovered Root", is_group=1)
		root.account_type = "Bank"
		root.save()
		child = make_account("Recovered Bank", parent_books_account=root.name)
		self.assertEqual(child.root_type, root.root_type)

	def test_child_inherits_root_type_from_group(self):
		parent = make_account("Test Assets", is_group=1)
		child = make_account(
			"Test Bank",
			root_type="Income",
			parent_books_account=parent.name,
		)

		self.assertEqual(child.root_type, "Asset")

	def test_account_without_a_type_has_none(self):
		self.assertFalse(make_account("Untyped").account_type)

	def test_leaf_account_cannot_be_parent(self):
		parent = make_account("Test Cash")
		child = frappe.get_doc(
			{
				"doctype": "Books Account",
				"account_name": unique_name("Test Bank"),
				"root_type": "Asset",
				"parent_books_account": parent.name,
			}
		)

		self.assertRaises(frappe.ValidationError, child.insert)
