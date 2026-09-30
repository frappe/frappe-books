# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import now_datetime

from frappe_books.frappe_books.doctype.books_purchase_receipt.books_purchase_receipt import (
	make_purchase_invoice,
	make_return,
)
from frappe_books.tests.accounting import (
	ledger_entries,
	make_account,
	make_item,
	make_party,
	set_inventory_accounts,
	stock_quantity,
	unique_name,
)


class IntegrationTestBooksPurchaseReceipt(IntegrationTestCase):
	def test_receipt_adds_stock_and_posts_inventory_accounts(self):
		stock = make_account("Stock", account_type="Stock")
		received = make_account(
			"Received Not Billed", root_type="Liability", account_type="Stock Received But Not Billed"
		)
		cogs = make_account("COGS", root_type="Expense", account_type="Cost of Goods Sold")
		income = make_account("Income", root_type="Income")
		payable = make_account("Payable", root_type="Liability", account_type="Payable")
		party = make_party(payable.name, role="Supplier")
		item = make_item(income.name, received.name, track_item=1)
		set_inventory_accounts(stock.name, received.name, cogs.name)

		receipt = frappe.get_doc(
			{
				"doctype": "Books Purchase Receipt",
				"party": party.name,
				"date": now_datetime(),
				"items": [{"item": item.name, "location": "Stores", "quantity": 4, "rate": 25}],
			}
		).insert()
		receipt.submit()

		self.assertEqual(stock_quantity(item.name, "Stores"), 4)
		entries = ledger_entries(receipt.doctype, receipt.name)
		self.assertEqual(sum(Decimal(str(row.debit or 0)) for row in entries), Decimal("100"))
		self.assertEqual(sum(Decimal(str(row.credit or 0)) for row in entries), Decimal("100"))

	def test_purchase_return_posts_fifo_value(self):
		stock = make_account("Stock", account_type="Stock")
		received = make_account(
			"Received", root_type="Liability", account_type="Stock Received But Not Billed"
		)
		cogs = make_account("COGS", root_type="Expense", account_type="Cost of Goods Sold")
		set_inventory_accounts(stock.name, received.name, cogs.name)
		item = make_item(
			make_account("Income", root_type="Income").name,
			make_account("Received", root_type="Liability").name,
			track_item=1,
		)
		make_receipt(item.name, quantity=2, rate=10)
		receipt = make_receipt(item.name, quantity=2, rate=20)

		purchase_return = make_receipt(item.name, quantity=-1, rate=20, return_against=receipt.name)

		entries = ledger_entries(purchase_return.doctype, purchase_return.name)
		stock_credit = sum(Decimal(str(row.credit or 0)) for row in entries if row.account == stock.name)
		self.assertEqual(stock_credit, Decimal("10"))
		self.assertEqual(stock_value_change(purchase_return), -stock_credit)

	def test_purchase_return_cannot_exceed_the_received_quantity(self):
		set_inventory_accounts(
			make_account("Stock", account_type="Stock").name,
			make_account("Received", root_type="Liability").name,
			make_account("COGS", root_type="Expense").name,
		)
		item = make_item(
			make_account("Income", root_type="Income").name,
			make_account("Received", root_type="Liability").name,
			track_item=1,
		)
		make_receipt(item.name, quantity=5, rate=10)
		receipt = make_receipt(item.name, quantity=2, rate=10)

		with self.assertRaisesRegex(frappe.ValidationError, "exceed the quantity of 2"):
			make_receipt(item.name, quantity=-3, rate=10, return_against=receipt.name)

	def test_invoice_and_return_are_mapped_from_a_receipt(self):
		set_inventory_accounts(
			make_account("Stock", account_type="Stock").name,
			make_account("Received", root_type="Liability").name,
			make_account("COGS", root_type="Expense").name,
		)
		item = make_item(
			make_account("Income", root_type="Income").name,
			make_account("Received", root_type="Liability").name,
			track_item=1,
		)
		receipt = make_receipt(item.name, quantity=2, rate=10)
		payable = frappe.db.get_value("Books Party", receipt.party, "default_account")

		invoice = make_purchase_invoice(receipt.name)
		purchase_return = make_return(receipt.name)

		self.assertEqual(
			(invoice.doctype, invoice.back_reference, invoice.account, invoice.grand_total),
			("Books Purchase Invoice", receipt.name, payable, 20),
		)
		self.assertEqual(
			(purchase_return.doctype, purchase_return.return_against, purchase_return.items[0].quantity),
			("Books Purchase Receipt", receipt.name, -2),
		)

	def test_receipt_is_billed_only_once(self):
		set_inventory_accounts(
			make_account("Stock", account_type="Stock").name,
			make_account("Received", root_type="Liability").name,
			make_account("COGS", root_type="Expense").name,
		)
		item = make_item(
			make_account("Income", root_type="Income").name,
			make_account("Received", root_type="Liability").name,
			track_item=1,
		)
		receipt = make_receipt(item.name, quantity=2, rate=10)
		first = make_purchase_invoice(receipt.name).insert()
		again = make_purchase_invoice(receipt.name).insert()

		first.submit()

		self.assertRaisesRegex(frappe.ValidationError, "exceed the quantity of 2", again.submit)

	def test_receipt_comes_from_a_supplier(self):
		item = make_item(
			make_account("Income", root_type="Income").name,
			make_account("Received", root_type="Liability").name,
			track_item=1,
		)
		customer = make_party(make_account("Receivable", account_type="Receivable").name)
		receipt = frappe.get_doc(
			{
				"doctype": "Books Purchase Receipt",
				"party": customer.name,
				"date": now_datetime(),
				"items": [{"item": item.name, "location": "Stores", "quantity": 1, "rate": 10}],
			}
		)

		self.assertRaisesRegex(frappe.ValidationError, "must be a Supplier", receipt.insert)

	def test_receipt_names_missing_serial_numbers_from_the_item_series(self):
		prefix = f"S{frappe.generate_hash(length=6)}-"
		received = make_account("Received", root_type="Liability")
		income = make_account("Income", root_type="Income")
		item = make_item(
			income.name,
			received.name,
			track_item=1,
			has_serial_number=1,
			serial_number_series=prefix,
		)
		typed = unique_name("SN")
		payable = make_account("Payable", root_type="Liability", account_type="Payable")
		row = {"item": item.name, "location": "Stores", "quantity": 3, "rate": 10}
		receipt = frappe.get_doc(
			{
				"doctype": "Books Purchase Receipt",
				"party": make_party(payable.name, role="Supplier").name,
				"date": now_datetime(),
				"items": [{**row, "serial_number": typed}, {**row, "quantity": 1}],
			}
		)

		receipt.preview()
		self.assertEqual([row.serial_number for row in receipt.items], [typed, None])

		receipt.insert()
		self.assertEqual(
			receipt.items[0].serial_number.splitlines(), [typed, f"{prefix}1001", f"{prefix}1002"]
		)
		self.assertEqual(receipt.items[1].serial_number, f"{prefix}1003")


def make_receipt(item, quantity, rate, return_against=None, date=None):
	payable = make_account("Payable", root_type="Liability", account_type="Payable")
	receipt = frappe.get_doc(
		{
			"doctype": "Books Purchase Receipt",
			"party": make_party(payable.name, role="Supplier").name,
			"date": date or now_datetime(),
			"return_against": return_against,
			"items": [{"item": item, "location": "Stores", "quantity": quantity, "rate": rate}],
		}
	).insert()
	receipt.submit()
	return receipt


def stock_value_change(transaction):
	values = frappe.get_all(
		"Books Stock Ledger Entry",
		filters={"reference_type": transaction.doctype, "reference_name": transaction.name},
		pluck="value_change",
	)
	return sum(Decimal(str(value)) for value in values)
