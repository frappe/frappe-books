# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import now_datetime

from frappe_books.frappe_books.doctype.books_purchase_receipt.test_books_purchase_receipt import (
	set_inventory_accounts,
	stock_value_change,
)
from frappe_books.inventory.stock import stock_quantity
from frappe_books.tests.accounting import ledger_entries, make_account, make_invoice, make_item, make_party


class IntegrationTestBooksShipment(IntegrationTestCase):
	def test_shipment_removes_stock_posts_cogs_and_reverses(self):
		stock = make_account("Stock", account_type="Stock")
		received = make_account("Received", root_type="Liability")
		cogs = make_account("COGS", root_type="Expense", account_type="Cost of Goods Sold")
		income = make_account("Income", root_type="Income")
		expense = make_account("Expense", root_type="Expense")
		receivable = make_account("Receivable", account_type="Receivable")
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name, track_item=1)
		set_inventory_accounts(stock.name, received.name, cogs.name)
		seed_stock(item.name, quantity=4, rate=25)

		shipment = frappe.get_doc(
			{
				"doctype": "Books Shipment",
				"party": party.name,
				"date": now_datetime(),
				"items": [{"item": item.name, "location": "Stores", "quantity": 2, "rate": 25}],
			}
		).insert()
		shipment.submit()

		self.assertEqual(stock_quantity(item.name, "Stores"), 2)
		entries = ledger_entries(shipment.doctype, shipment.name)
		self.assertEqual(sum(Decimal(str(row.debit or 0)) for row in entries), Decimal("50"))
		self.assertEqual(sum(Decimal(str(row.credit or 0)) for row in entries), Decimal("50"))

		shipment.cancel()
		self.assertEqual(stock_quantity(item.name, "Stores"), 4)
		self.assertEqual(len(ledger_entries(shipment.doctype, shipment.name)), 4)

	def test_shipment_posts_fifo_cost_not_selling_rate(self):
		item, cogs, stock = self._tracked_item()
		seed_stock(item.name, quantity=4, rate=10)
		seed_stock(item.name, quantity=2, rate=20)

		shipment = self._make_shipment(item, quantity=5, rate=25)
		shipment.submit()

		entries = ledger_entries(shipment.doctype, shipment.name)
		cogs_entry = next(row for row in entries if row.account == cogs.name)
		stock_entry = next(row for row in entries if row.account == stock.name)
		self.assertEqual(Decimal(str(cogs_entry.debit)), Decimal("60"))
		self.assertEqual(Decimal(str(stock_entry.credit)), Decimal("60"))

	def test_return_shipment_posts_current_valuation(self):
		item, cogs, stock = self._tracked_item()
		seed_stock(item.name, quantity=4, rate=10)
		seed_stock(item.name, quantity=2, rate=20)
		shipment = self._make_shipment(item, quantity=5, rate=25)
		shipment.submit()

		return_shipment = self._make_shipment(item, quantity=1, rate=25, return_against=shipment.name)
		return_shipment.submit()

		entries = ledger_entries(return_shipment.doctype, return_shipment.name)
		stock_entry = next(row for row in entries if row.account == stock.name)
		cogs_entry = next(row for row in entries if row.account == cogs.name)
		self.assertEqual(Decimal(str(stock_entry.debit)), Decimal("20"))
		self.assertEqual(Decimal(str(cogs_entry.credit)), Decimal("20"))
		self.assertEqual(stock_quantity(item.name, "Stores"), 2)
		self.assertEqual(stock_value_change(return_shipment), Decimal("20"))

	def test_shipment_against_invoice_updates_quantity_to_transfer(self):
		item, cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=5, rate=10)
		invoice = self._make_invoice(item, cogs)

		first = self._make_shipment(item, quantity=1, rate=100, back_reference=invoice.name)
		first.submit()
		self.assertEqual(transfer_balance(invoice), [1, 1])

		self._make_shipment(item, quantity=1, rate=100, back_reference=invoice.name).submit()
		self.assertEqual(transfer_balance(invoice), [0, 0])

		first.cancel()
		self.assertEqual(transfer_balance(invoice), [1, 1])

	def test_shipment_cannot_move_more_than_invoice_has_left(self):
		item, cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=5, rate=10)
		invoice = self._make_invoice(item, cogs)
		self._make_shipment(item, quantity=2, rate=100, back_reference=invoice.name).submit()

		again = self._make_shipment(item, quantity=1, rate=100, back_reference=invoice.name)

		self.assertRaisesRegex(frappe.ValidationError, "left to transfer", again.submit)

	def test_return_shipment_marks_original_returned_until_cancelled(self):
		item, _cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=2, rate=10)
		shipment = self._make_shipment(item, quantity=2, rate=25)
		shipment.submit()

		return_shipment = self._make_shipment(item, quantity=1, rate=25, return_against=shipment.name)
		return_shipment.submit()
		self.assertEqual(frappe.db.get_value(shipment.doctype, shipment.name, "is_returned"), 1)

		return_shipment.cancel()
		self.assertEqual(frappe.db.get_value(shipment.doctype, shipment.name, "is_returned"), 0)

	def _make_invoice(self, item, account):
		receivable = make_account("Receivable", account_type="Receivable")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", account.name)
		invoice = make_invoice(
			"Books Sales Invoice",
			make_party(receivable.name).name,
			receivable.name,
			item.name,
			item.income_account,
		)
		invoice.submit()
		return invoice

	def _tracked_item(self):
		stock = make_account("Stock", account_type="Stock")
		received = make_account("Received", root_type="Liability")
		cogs = make_account("COGS", root_type="Expense", account_type="Cost of Goods Sold")
		income = make_account("Income", root_type="Income")
		expense = make_account("Expense", root_type="Expense")
		set_inventory_accounts(stock.name, received.name, cogs.name)
		return make_item(income.name, expense.name, track_item=1), cogs, stock

	def _make_shipment(self, item, quantity, rate, **values):
		receivable = make_account("Receivable", account_type="Receivable")
		party = make_party(receivable.name)
		return frappe.get_doc(
			{
				"doctype": "Books Shipment",
				"party": party.name,
				"date": now_datetime(),
				"items": [{"item": item.name, "location": "Stores", "quantity": quantity, "rate": rate}],
				**values,
			}
		).insert()


def seed_stock(item, quantity, rate):
	movement = frappe.get_doc(
		{
			"doctype": "Books Stock Movement",
			"movement_type": "MaterialReceipt",
			"date": now_datetime(),
			"items": [{"item": item, "to_location": "Stores", "quantity": quantity, "rate": rate}],
		}
	).insert(ignore_permissions=True)
	movement.submit()


def transfer_balance(invoice):
	"""Return the invoice's and its first row's quantity still to transfer."""
	invoice.reload()
	return [invoice.stock_not_transferred, invoice.items[0].stock_not_transferred]
