# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.company import default_company
from frappe_books.frappe_books.doctype.books_item.books_item import make_purchase_invoice, make_sales_invoice
from frappe_books.tests.accounting import (
	ensure_user,
	make_account,
	make_item,
	make_tax,
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
	def test_validates_hsn_and_rate(self):
		income = make_account("Item Sales", root_type="Income", account_type="Income Account")
		expense = make_account("Item Expense", root_type="Expense", account_type="Expense Account")
		with self.assertRaises(frappe.ValidationError):
			make_item(income.name, expense.name, gst_hsn_code="12A4")
		with self.assertRaises(frappe.NonNegativeError):
			make_item(income.name, expense.name, standard_rate=-1)
		item = make_item(income.name, expense.name, gst_hsn_code="123456")
		self.assertEqual(item.gst_hsn_code, "123456")

	def test_a_barcode_of_any_length_names_one_item(self):
		income = make_account("Item Sales", root_type="Income", account_type="Income Account")
		expense = make_account("Item Expense", root_type="Expense", account_type="Expense Account")
		code = frappe.generate_hash(length=5)
		item = make_item(income.name, expense.name, barcodes=[{"barcode": code}])

		self.assertEqual([row.barcode for row in item.barcodes], [code])
		with self.assertRaises(frappe.UniqueValidationError):
			make_item(income.name, expense.name, barcodes=[{"barcode": code}])

	def test_item_is_named_by_its_code_and_titled_by_it_unless_named(self):
		income = make_account("Item Sales", root_type="Income")
		expense = make_account("Item Expense", root_type="Expense")
		code = unique_name("CODE")
		named = make_item(income.name, expense.name, item_name="Green Tea")
		item = make_item(income.name, expense.name, item_code=code)

		self.assertEqual((item.name, item.item_name), (code, code))
		self.assertEqual(named.item_name, "Green Tea")

	def test_item_group_hsn_code_must_contain_four_to_eight_digits(self):
		group = frappe.get_doc(
			{"doctype": "Books Item Group", "item_group_name": unique_name("Group"), "gst_hsn_code": "12A4"}
		)

		self.assertRaisesRegex(frappe.ValidationError, "between 4 and 8 digits", group.insert)

	def test_hsn_code_digits_are_checked_only_for_an_indian_company(self):
		income = make_account("Item Sales", root_type="Income", account_type="Income Account")
		expense = make_account("Item Expense", root_type="Expense", account_type="Expense Account")
		with patch("frappe_books.regional.company_country", return_value="United States"):
			item = make_item(income.name, expense.name, gst_hsn_code="1234567890")

		self.assertEqual(item.gst_hsn_code, "1234567890")

	def test_missing_accounts_and_hsn_code_get_the_app_defaults(self):
		cogs, received, group = self.make_default_sources()

		service = make_item(None, None, item_type="Service", item_group=group.name)
		product = make_item(None, None, is_stock_item=1)

		self.assertEqual(_accounts(service), ("Service", cogs.name))
		self.assertEqual(service.gst_hsn_code, "998877")
		self.assertEqual(_accounts(product), ("Sales", received.name))

	def test_accounts_are_kept_once_for_the_one_company(self):
		item = make_item(None, None)

		self.assertEqual([row.company for row in item.item_defaults], [default_company()])
		item.append("item_defaults", {"company": default_company()})
		self.assertRaisesRegex(frappe.ValidationError, "multiple Item Defaults", item.save)

	def test_taxes_list_the_newest_valid_from_first(self):
		account = make_account("Tax", root_type="Liability", account_type="Tax").name
		old, new, undated = (make_tax(account).name for _ in range(3))
		item = make_item(None, None)
		item.taxes = []
		item.append("taxes", {"item_tax_template": old, "valid_from": "2025-04-01"})
		item.append("taxes", {"item_tax_template": undated})
		item.append("taxes", {"item_tax_template": new, "valid_from": "2026-04-01"})
		item.save()

		self.assertEqual(
			[(row.idx, row.item_tax_template) for row in item.taxes], [(1, new), (2, old), (3, undated)]
		)

	def test_accounts_follow_the_item_tracking(self):
		income = make_account("Item Sales", root_type="Income")
		expense = make_account("Item Expense", root_type="Expense")
		received = make_account("Item Received", root_type="Liability")
		for accounts, values, message in (
			((expense, expense), {}, "Income Account must be of type Income"),
			((income, received), {}, "Expense Account must be of type Expense"),
			((income, expense), {"is_stock_item": 1}, "Expense Account must be of type Liability"),
		):
			with self.subTest(message=message), self.assertRaisesRegex(frappe.ValidationError, message):
				make_item(accounts[0].name, accounts[1].name, **values)

		self.assertTrue(make_item(income.name, received.name, is_stock_item=1).is_stock_item)

	def test_tracked_series_become_naming_patterns(self):
		income = make_account("Item Sales", root_type="Income")
		received = make_account("Item Received", root_type="Liability")
		prefix = f"B{frappe.generate_hash(length=6)}"
		item = make_item(
			income.name,
			received.name,
			is_stock_item=1,
			has_batch_no=1,
			batch_number_series=f" {prefix} ",
			serial_no_series="SERIAL",
		)

		self.assertEqual(
			(item.batch_number_series, item.create_new_batch, item.serial_no_series),
			(f"{prefix}-.####", 1, "SERIAL"),
		)

	def test_item_maps_to_an_invoice_row(self):
		income = make_account("Mapped Sales", root_type="Income")
		expense = make_account("Mapped Expense", root_type="Expense")
		item = make_item(income.name, expense.name, standard_rate=40)

		invoice = make_purchase_invoice(item.name)

		row = invoice.items[0]
		self.assertEqual(
			(row.item_code, row.qty, row.price_list_rate, row.expense_account),
			(item.name, 1, 40, expense.name),
		)

	def test_item_invoice_row_shows_its_quantity(self):
		income = make_account("Mapped Sales", root_type="Income")
		expense = make_account("Mapped Expense", root_type="Expense")
		item = make_item(income.name, expense.name, standard_rate=40)

		row = make_sales_invoice(item.name).items[0]

		self.assertEqual((row.qty, row.stock_qty), (1, 1))

	def test_preview_fills_what_a_save_would_without_saving(self):
		cogs, received, group = self.make_default_sources()
		item = frappe.new_doc("Books Item", item_type="Service", item_group=group.name)
		item.item_code = unique_name("Preview Item")

		item.preview()

		self.assertEqual(_accounts(item), ("Service", cogs.name))
		self.assertEqual(item.gst_hsn_code, "998877")
		self.assertFalse(frappe.db.exists("Books Item", item.item_code))

		item.update({"item_type": "Product", "is_stock_item": 1})
		item.item_defaults[0].update({"income_account": None, "expense_account": None})
		item.preview()
		self.assertEqual(_accounts(item), ("Sales", received.name))

	def test_preview_needs_the_right_to_make_items(self):
		item = frappe.new_doc("Books Item")
		with self.set_user(ensure_user(READ_ONLY_USER)), self.assertRaises(frappe.PermissionError):
			item.preview()

	def make_default_sources(self):
		"""The accounts and item group an item without its own takes them from."""
		for name in ("Sales", "Service"):
			if not frappe.db.exists("Books Account", name):
				values = {"account_name": name, "parent_account": root_group("Income")}
				frappe.get_doc({"doctype": "Books Account", **values}).insert()
		cogs = make_account("Item COGS", root_type="Expense", account_type="Cost of Goods Sold")
		received = make_account("Item Received", root_type="Liability")
		set_inventory_accounts(None, received.name, cogs.name)
		group = frappe.get_doc(
			{"doctype": "Books Item Group", "item_group_name": unique_name("Group"), "gst_hsn_code": "998877"}
		).insert()
		return cogs, received, group


def _accounts(item):
	"""The item's income and expense accounts for the one company."""
	row = item.item_defaults[0]
	return row.income_account, row.expense_account
