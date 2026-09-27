# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account, make_item

# On IntegrationTestCase, the doctype test records and all
# link-field test record dependencies are recursively loaded
# Use these module variables to add/remove to/from that list
EXTRA_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]
IGNORE_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]


class IntegrationTestBooksItem(IntegrationTestCase):
	def test_validates_hsn_barcode_and_rate(self):
		income = make_account("Item Sales", root_type="Income", account_type="Income Account")
		expense = make_account("Item Expense", root_type="Expense", account_type="Expense Account")
		with self.assertRaises(frappe.ValidationError):
			make_item(income.name, expense.name, hsn_code="12A4")
		with self.assertRaises(frappe.ValidationError):
			make_item(income.name, expense.name, barcode="123")
		with self.assertRaises(frappe.NonNegativeError):
			make_item(income.name, expense.name, rate=-1)
		item = make_item(income.name, expense.name, hsn_code="123456", barcode="123456789012")
		self.assertEqual(item.hsn_code, "123456")

	def test_accounts_follow_the_item_tracking(self):
		income = make_account("Item Sales", root_type="Income")
		expense = make_account("Item Expense", root_type="Expense")
		received = make_account("Item Received", root_type="Liability")
		for accounts, values, message in (
			((expense, expense), {}, "Sales Acc. must be of type Income"),
			((income, received), {}, "Purchase Acc. must be of type Expense"),
			((income, expense), {"track_item": 1}, "Purchase Acc. must be of type Liability"),
		):
			with self.subTest(message=message), self.assertRaisesRegex(frappe.ValidationError, message):
				make_item(accounts[0].name, accounts[1].name, **values)

		self.assertTrue(make_item(income.name, received.name, track_item=1).track_item)
