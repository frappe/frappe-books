"""Integration coverage for invoice-driven stock transfers."""

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.frappe_books.doctype.books_purchase_receipt.test_books_purchase_receipt import (
	set_inventory_accounts,
)
from frappe_books.frappe_books.doctype.books_stock_movement.test_books_stock_movement import (
	make_movement,
)
from frappe_books.inventory.stock import stock_quantity
from frappe_books.tests.accounting import (
	ledger_entries,
	make_account,
	make_invoice,
	make_item,
	make_party,
	unique_name,
)


class IntegrationTestAutoTransfer(IntegrationTestCase):
	def test_pos_shipment_uses_pos_inventory(self):
		self._check_pos_inventory(use_profile=False)

	def test_pos_shipment_uses_profile_inventory(self):
		self._check_pos_inventory(use_profile=True)

	def test_pos_shipment_still_rejects_insufficient_inventory(self):
		invoice, item, location = self._make_pos_invoice(use_profile=True, opening_quantity=1)
		with self.assertRaisesRegex(frappe.ValidationError, f"at {location.name}:"):
			invoice.submit()
		self.assertEqual(stock_quantity(item.name, location.name), 1)
		self.assertEqual(stock_quantity(item.name, "Stores"), 0)

	def test_sales_invoice_creates_and_cancels_shipment(self):
		invoice, item = self._sales_invoice(make_auto_stock_transfer=1)
		invoice.submit()

		shipment = frappe.get_doc("Books Shipment", invoice.reload().back_reference)
		self.assertEqual(shipment.docstatus, 1)
		self.assertEqual(shipment.back_reference, invoice.name)
		self.assertEqual(stock_quantity(item, "Stores"), 3)
		self.assertEqual([invoice.stock_not_transferred, invoice.items[0].stock_not_transferred], [0, 0])

		invoice.cancel()
		self.assertEqual(frappe.db.get_value("Books Shipment", shipment.name, "docstatus"), 2)
		self.assertEqual(stock_quantity(item, "Stores"), 5)

	def test_invoice_submit_stores_its_own_quantity_to_transfer(self):
		invoice, _item = self._sales_invoice()
		invoice.stock_not_transferred = 0
		invoice.items[0].stock_not_transferred = 0
		invoice.save().submit()

		self.assertEqual([invoice.stock_not_transferred, invoice.items[0].stock_not_transferred], [2, 2])
		invoice.reload()
		self.assertEqual([invoice.stock_not_transferred, invoice.items[0].stock_not_transferred], [2, 2])

	def test_invoice_rows_follow_the_item_batch_rule(self):
		invoice, item = self._sales_invoice()
		frappe.db.set_value("Books Item", item, "has_batch", 1)

		self.assertRaisesRegex(frappe.ValidationError, "requires a batch", invoice.save)

	def test_return_without_original_transfer_does_not_ship_again(self):
		original, item = self._sales_invoice()
		original.submit()
		return_invoice = frappe.get_doc(
			{
				"doctype": original.doctype,
				"party": original.party,
				"account": original.account,
				"date": original.date,
				"return_against": original.name,
				"make_auto_stock_transfer": 1,
				"items": [{"item": item, "rate": 100, "quantity": -2, "item_discount_percent": 10}],
			}
		).insert()

		self.assertRaisesRegex(frappe.ValidationError, "no stock transfer to return", return_invoice.submit)
		self.assertEqual(stock_quantity(item, "Stores"), 5)

	def test_invoice_cancel_keeps_a_shipment_that_has_a_return(self):
		invoice, _item = self._sales_invoice(make_auto_stock_transfer=1)
		invoice.submit()
		shipment = frappe.get_doc("Books Shipment", invoice.reload().back_reference)
		return_shipment = frappe.get_doc(
			{
				"doctype": shipment.doctype,
				"party": shipment.party,
				"date": shipment.date,
				"return_against": shipment.name,
				"items": [{**shipment.items[0].as_dict(no_default_fields=True), "quantity": 1}],
			}
		)
		return_shipment.insert().submit()

		self.assertRaises(frappe.LinkExistsError, invoice.cancel)

	def test_auto_transfer_requires_a_default_location(self):
		invoice, _item = self._sales_invoice(make_auto_stock_transfer=1)
		frappe.db.set_single_value("Books Defaults", "shipment_location", None)

		self.assertRaisesRegex(frappe.ValidationError, "Set Shipment Location", invoice.submit)

	def _sales_invoice(self, **values):
		receivable = make_account("Auto Receivable", account_type="Receivable")
		income = make_account("Auto Sales", root_type="Income", account_type="Income Account")
		cogs = make_account("Auto COGS", root_type="Expense", account_type="Cost of Goods Sold")
		stock = make_account("Auto Stock", account_type="Stock")
		received = make_account("Auto Received", root_type="Liability")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", cogs.name)
		set_inventory_accounts(stock.name, received.name, cogs.name)
		frappe.db.set_single_value("Books Defaults", "shipment_location", "Stores")
		item = make_item(income.name, cogs.name, track_item=1, rate=10)
		make_movement(
			"MaterialReceipt",
			[{"item": item.name, "to_location": "Stores", "quantity": 5, "rate": 10}],
		).submit()
		invoice = make_invoice(
			"Books Sales Invoice",
			make_party(receivable.name).name,
			receivable.name,
			item.name,
			income.name,
			**values,
		)
		return invoice, item.name

	def test_foreign_currency_receipt_uses_base_currency_rate(self):
		payable = make_account("FX Payable", root_type="Liability", account_type="Payable")
		stock = make_account("FX Stock", account_type="Stock")
		received = make_account("FX Received", root_type="Liability")
		expense = make_account("FX Expense", root_type="Expense")
		set_inventory_accounts(stock.name, received.name, expense.name)
		frappe.db.set_single_value("Books Defaults", "purchase_receipt_location", "Stores")
		item = make_item(expense.name, expense.name, track_item=1)
		invoice = make_invoice(
			"Books Purchase Invoice",
			make_party(payable.name, role="Supplier").name,
			payable.name,
			item.name,
			received.name,
			make_auto_stock_transfer=1,
			exchange_rate=80,
		)
		invoice.items[0].update({"quantity": 1, "rate": 100, "item_discount_percent": 0})
		invoice.save().submit()

		receipt = frappe.get_doc("Books Purchase Receipt", invoice.reload().back_reference)
		self.assertEqual(receipt.items[0].rate, 8000)
		entries = ledger_entries(receipt.doctype, receipt.name)
		self.assertEqual(sum(Decimal(str(row.debit)) for row in entries if row.account == stock.name), 8000)

	def test_invoice_cancel_keeps_auto_receipt_once_its_stock_is_used(self):
		payable = make_account("Used Payable", root_type="Liability", account_type="Payable")
		stock = make_account("Used Stock", account_type="Stock")
		received = make_account("Used Received", root_type="Liability")
		expense = make_account("Used Expense", root_type="Expense")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		set_inventory_accounts(stock.name, received.name, expense.name)
		frappe.db.set_single_value("Books Defaults", "purchase_receipt_location", "Stores")
		item = make_item(expense.name, expense.name, track_item=1)
		invoice = make_invoice(
			"Books Purchase Invoice",
			make_party(payable.name, role="Supplier").name,
			payable.name,
			item.name,
			received.name,
			make_auto_stock_transfer=1,
		)
		invoice.submit()
		make_movement(
			"MaterialIssue",
			[{"item": item.name, "from_location": "Stores", "quantity": 2, "rate": 10}],
		).submit()

		self.assertRaisesRegex(frappe.ValidationError, "Insufficient stock", invoice.cancel)
		self.assertEqual(stock_quantity(item.name, "Stores"), 0)

	def _check_pos_inventory(self, use_profile):
		invoice, item, location = self._make_pos_invoice(use_profile)
		invoice.submit()
		shipment = frappe.get_doc("Books Shipment", invoice.reload().back_reference)
		self.assertEqual(shipment.docstatus, 1)
		self.assertEqual(shipment.items[0].location, location.name)
		self.assertEqual(stock_quantity(item.name, location.name), 3)
		self.assertEqual(stock_quantity(item.name, "Stores"), 0)
		invoice.cancel()
		self.assertEqual(stock_quantity(item.name, location.name), 5)

	def _make_pos_invoice(self, use_profile, opening_quantity=5):
		receivable = make_account("POS Receivable", account_type="Receivable")
		income = make_account("POS Sales", root_type="Income", account_type="Income Account")
		cogs = make_account("POS COGS", root_type="Expense", account_type="Cost of Goods Sold")
		stock = make_account("POS Stock", account_type="Stock")
		received = make_account("POS Received", root_type="Liability")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", cogs.name)
		set_inventory_accounts(stock.name, received.name, cogs.name)
		frappe.db.set_single_value("Books Defaults", "shipment_location", "Stores")
		location = frappe.get_doc({"doctype": "Books Location", "name": unique_name("POS Shelf")}).insert()
		profile = None
		if use_profile:
			profile = frappe.get_doc(
				{
					"doctype": "Books Pos Profile",
					"name": unique_name("POS Profile"),
					"inventory": location.name,
					"can_change_rate": 1,
					"can_edit_discount": 1,
				}
			).insert()
		frappe.db.set_single_value("Books Pos Settings", "pos_profile", profile.name if profile else "")
		frappe.db.set_single_value("Books Pos Settings", {"can_change_rate": 1, "can_edit_discount": 1})
		frappe.db.set_single_value("Books Pos Settings", "inventory", "Stores" if profile else location.name)
		party = make_party(receivable.name)
		item = make_item(income.name, cogs.name, track_item=1, rate=10)
		make_movement(
			"MaterialReceipt",
			[{"item": item.name, "to_location": location.name, "quantity": opening_quantity, "rate": 10}],
		).submit()
		invoice = make_invoice(
			"Books Sales Invoice",
			party.name,
			receivable.name,
			item.name,
			income.name,
			is_pos=1,
			make_auto_stock_transfer=1,
		)
		return invoice, item, location
