# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import (
	make_account,
	make_item,
	root_group,
	set_inventory_accounts,
	unique_name,
)

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

	def test_missing_accounts_and_hsn_code_get_the_app_defaults(self):
		for name in ("Sales", "Service"):
			if not frappe.db.exists("Books Account", name):
				values = {"account_name": name, "parent_books_account": root_group("Income")}
				frappe.get_doc({"doctype": "Books Account", **values}).insert()
		cogs = make_account("Item COGS", root_type="Expense", account_type="Cost of Goods Sold")
		received = make_account("Item Received", root_type="Liability")
		set_inventory_accounts(None, received.name, cogs.name)
		group = frappe.get_doc(
			{"doctype": "Books Item Group", "name": unique_name("Group"), "hsn_code": "998877"}
		).insert()

		service = make_item(None, None, item_type="Service", item_group=group.name)
		product = make_item(None, None, track_item=1)

		self.assertEqual((service.income_account, service.expense_account), ("Service", cogs.name))
		self.assertEqual(service.hsn_code, "998877")
		self.assertEqual((product.income_account, product.expense_account), ("Sales", received.name))

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

	def test_tracked_series_names_end_with_a_dash(self):
		income = make_account("Item Sales", root_type="Income")
		received = make_account("Item Received", root_type="Liability")
		prefix = f"B{frappe.generate_hash(length=6)}"
		item = make_item(
			income.name,
			received.name,
			track_item=1,
			has_batch=1,
			batch_series=f" {prefix} ",
			serial_number_series="SERIAL",
		)

		self.assertEqual((item.batch_series, item.serial_number_series), (f"{prefix}-", "SERIAL"))
