# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils.nestedset import NestedSetChildExistsError

from frappe_books.tests.accounting import ensure_user, make_account, unique_name

READ_ONLY_USER = "books-account-preview-reader@example.com"


class IntegrationTestBooksAccount(IntegrationTestCase):
	def test_root_deletion_is_blocked_but_children_can_be_deleted(self):
		root = make_account("Protected Assets", is_group=1)
		child = make_account("Disposable Cash", parent_books_account=root.name)
		child.delete()
		with self.assertRaisesRegex(frappe.ValidationError, "Root accounts cannot be deleted"):
			root.delete()
		self.assertTrue(frappe.db.exists(root.doctype, root.name))

	def test_a_group_with_children_says_what_the_books_chart_says(self):
		root = make_account("Kept Assets", is_group=1)
		group = make_account("Kept Bank Accounts", is_group=1, parent_books_account=root.name)
		make_account("Kept Bank", parent_books_account=group.name)
		with self.assertRaises(NestedSetChildExistsError) as raised:
			group.delete()
		self.assertEqual(str(raised.exception), f"{group.name} has linked child accounts.")

	def test_root_group_can_be_created_and_edited_after_setup(self):
		frappe.db.set_single_value("Books Accounting Settings", "setup_complete", 1)
		root = make_account("Recovered Root", is_group=1)
		root.account_type = "Bank"
		root.save()
		child = make_account("Recovered Bank", parent_books_account=root.name)
		self.assertEqual(child.root_type, root.root_type)

	def test_root_accounts_must_be_groups(self):
		with self.assertRaisesRegex(frappe.ValidationError, "Only group accounts can be root accounts"):
			make_account("Root Ledger", parent_books_account=None)

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

	def test_child_takes_the_group_account_type_unless_it_has_one(self):
		parent = make_account("Test Banks", is_group=1, account_type="Bank")
		self.assertEqual(make_account("Test Current", parent_books_account=parent.name).account_type, "Bank")
		child = make_account("Test Petty Cash", parent_books_account=parent.name, account_type="Cash")
		self.assertEqual(child.account_type, "Cash")

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

	def test_preview_fills_the_group_types_without_saving(self):
		parent = make_account("Preview Banks", is_group=1, account_type="Bank")
		child = frappe.new_doc("Books Account", account_name=unique_name("Preview Current"))
		child.update({"root_type": "Income", "parent_books_account": parent.name})

		child.preview()

		self.assertEqual((child.root_type, child.account_type), ("Asset", "Bank"))
		self.assertFalse(frappe.db.exists("Books Account", child.account_name))

	def test_preview_needs_the_right_to_make_accounts(self):
		account = frappe.new_doc("Books Account")
		with self.set_user(ensure_user(READ_ONLY_USER)), self.assertRaises(frappe.PermissionError):
			account.preview()
