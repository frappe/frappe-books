# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.frappe_books.doctype.books_item import books_item
from frappe_books.frappe_books.doctype.books_item.books_item import make_purchase_invoice, make_sales_invoice
from frappe_books.tests.accounting import (
	ensure_user,
	make_account,
	make_item,
	root_group,
	set_inventory_accounts,
	unique_name,
)

READ_ONLY_USER = "books-item-preview-reader@example.com"

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

	def test_hsn_code_digits_are_checked_only_for_an_indian_company(self):
		income = make_account("Item Sales", root_type="Income", account_type="Income Account")
		expense = make_account("Item Expense", root_type="Expense", account_type="Expense Account")
		with patch(f"{books_item.__name__}.company_country", return_value="United States"):
			item = make_item(income.name, expense.name, hsn_code="1234567890")

		self.assertEqual(item.hsn_code, "1234567890")

	def test_missing_accounts_and_hsn_code_get_the_app_defaults(self):
		cogs, received, group = self.make_default_sources()

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

	def test_item_maps_to_an_invoice_row(self):
		income = make_account("Mapped Sales", root_type="Income")
		expense = make_account("Mapped Expense", root_type="Expense")
		item = make_item(income.name, expense.name, rate=40)

		invoice = make_purchase_invoice(item.name)

		row = invoice.items[0]
		self.assertEqual((row.item, row.quantity, row.rate, row.account), (item.name, 1, 40, expense.name))

	def test_item_invoice_row_shows_its_quantity(self):
		income = make_account("Mapped Sales", root_type="Income")
		expense = make_account("Mapped Expense", root_type="Expense")
		item = make_item(income.name, expense.name, rate=40)

		row = make_sales_invoice(item.name).items[0]

		self.assertEqual((row.qty, row.transfer_quantity), (1, 1))

	def test_preview_fills_what_a_save_would_without_saving(self):
		cogs, received, group = self.make_default_sources()
		item = frappe.new_doc("Books Item", item_type="Service", item_group=group.name)
		item.name = unique_name("Preview Item")

		item.preview()

		self.assertEqual((item.income_account, item.expense_account), ("Service", cogs.name))
		self.assertEqual(item.hsn_code, "998877")
		self.assertFalse(frappe.db.exists("Books Item", item.name))

		item.update(
			{"item_type": "Product", "track_item": 1, "income_account": None, "expense_account": None}
		)
		item.preview()
		self.assertEqual((item.income_account, item.expense_account), ("Sales", received.name))

	def test_preview_needs_the_right_to_make_items(self):
		item = frappe.new_doc("Books Item")
		with self.set_user(ensure_user(READ_ONLY_USER)), self.assertRaises(frappe.PermissionError):
			item.preview()

	def make_default_sources(self):
		"""The accounts and item group an item without its own takes them from."""
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
		return cogs, received, group
