# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account, make_invoice, make_item, make_party, unique_name

# On IntegrationTestCase, the doctype test records and all
# link-field test record dependencies are recursively loaded
# Use these module variables to add/remove to/from that list
EXTRA_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]
IGNORE_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]


class IntegrationTestBooksParty(IntegrationTestCase):
	def test_registered_party_requires_valid_gstin(self):
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc(
				{
					"doctype": "Books Party",
					"name": unique_name("GST Party"),
					"role": "Customer",
					"gst_type": "Registered Regular",
					"gstin": "invalid",
				}
			).insert()

		party = frappe.get_doc(
			{
				"doctype": "Books Party",
				"name": unique_name("GST Party"),
				"role": "Customer",
				"gst_type": "Registered Regular",
				"gstin": "27AAAAA0000A1Z5",
			}
		).insert()
		self.assertEqual(party.gstin, "27AAAAA0000A1Z5")

	def test_registered_party_stores_normalized_gstin(self):
		party = frappe.get_doc(
			{
				"doctype": "Books Party",
				"name": unique_name("GST Party"),
				"role": "Customer",
				"gst_type": "Registered Regular",
				"gstin": " 27aaaaa0000a1z5 ",
			}
		).insert()
		self.assertEqual(party.gstin, "27AAAAA0000A1Z5")
		self.assertEqual(party.db_get("gstin"), "27AAAAA0000A1Z5")

	def test_unregistered_party_clears_gstin(self):
		party = frappe.get_doc(
			{
				"doctype": "Books Party",
				"name": unique_name("GST Party"),
				"role": "Customer",
				"gst_type": "Unregistered",
				"gstin": "27AAAAA0000A1Z5",
			}
		).insert()
		self.assertFalse(party.gstin)

	def test_stale_party_save_cannot_reset_outstanding(self):
		receivable = make_account("Stale Receivable", account_type="Receivable")
		income = make_account("Stale Income", root_type="Income")
		expense = make_account("Stale Expense", root_type="Expense")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		make_invoice("Books Sales Invoice", party.name, receivable.name, item.name, income.name).submit()

		party.email = "stale@example.com"
		with self.assertRaises(frappe.TimestampMismatchError):
			party.save()

	def test_outstanding_nets_sales_against_purchases(self):
		account = make_account("Both Account", account_type="Receivable")
		payable = make_account("Both Payable", root_type="Liability", account_type="Payable")
		income = make_account("Both Income", root_type="Income")
		expense = make_account("Both Expense", root_type="Expense")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		party = make_party(account.name, role="Both")
		item = make_item(income.name, expense.name)
		make_invoice("Books Sales Invoice", party.name, account.name, item.name, income.name).submit()
		purchase = make_invoice("Books Purchase Invoice", party.name, payable.name, item.name, expense.name)
		purchase.items[0].quantity = 1
		purchase.save().submit()

		self.assertEqual(party.db_get("outstanding_amount"), 180 - 90)
