"""Integration coverage for invoice-driven stock transfers."""

import re
from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.frappe_books.doctype.books_pos_opening_shift.test_books_pos_opening_shift import (
	start_pos_shift,
)
from frappe_books.frappe_books.doctype.books_purchase_invoice.books_purchase_invoice import (
	make_purchase_receipt,
)
from frappe_books.frappe_books.doctype.books_purchase_invoice.books_purchase_invoice import (
	make_return as make_purchase_return,
)
from frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice import (
	make_return as make_sales_return,
)
from frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice import make_shipment
from frappe_books.frappe_books.doctype.books_stock_movement.test_books_stock_movement import (
	make_movement,
)
from frappe_books.tests.accounting import (
	foreign_currency,
	ledger_entries,
	make_account,
	make_invoice,
	make_item,
	make_number_series,
	make_party,
	set_inventory_accounts,
	stock_quantity,
	unique_name,
)


class IntegrationTestAutoTransfer(IntegrationTestCase):
	def test_pos_shipment_uses_pos_inventory(self):
		self._check_pos_inventory(use_profile=False)

	def test_pos_shipment_uses_profile_inventory(self):
		self._check_pos_inventory(use_profile=True)

	def test_pos_shipment_still_rejects_insufficient_inventory(self):
		invoice, item, location = self._make_pos_invoice(use_profile=True, opening_quantity=1)
		with self.assertRaisesRegex(
			frappe.ValidationError, f"in {location.name}. Available: 1; required: 2."
		):
			invoice.submit()
		self.assertEqual(stock_quantity(item.name, location.name), 1)
		self.assertEqual(stock_quantity(item.name, "Stores"), 0)

	def test_pos_sale_of_an_item_out_of_stock_is_refused_as_the_pos_says(self):
		invoice, item, location = self._make_pos_invoice(use_profile=False)
		make_movement(
			"MaterialIssue",
			[{"item": item.name, "from_location": location.name, "quantity": 5, "rate": 10}],
		).submit()

		message = f"Item {item.name} is out of stock (quantity is zero)"
		self.assertRaisesRegex(frappe.ValidationError, re.escape(message), invoice.submit)

	def test_pos_sale_without_a_location_asks_for_the_pos_inventory(self):
		invoice, _item, _location = self._make_pos_invoice(use_profile=False)
		frappe.db.set_single_value("Books Pos Settings", "inventory", None)
		frappe.db.set_single_value("Books Defaults", "shipment_location", None)

		self.assertRaisesRegex(
			frappe.ValidationError, "POS Inventory is not set. Please set it on POS Settings", invoice.submit
		)

	def test_pos_sale_preview_fills_serial_numbers_in_stock_at_the_pos(self):
		invoice, item, location = self._make_pos_invoice(use_profile=False)
		frappe.db.set_value("Books Item", item.name, "has_serial_number", 1)
		serial_numbers = sorted(unique_name("SN") for _ in range(3))
		row = {"item": item.name, "to_location": location.name, "quantity": 3, "rate": 10}
		make_movement("MaterialReceipt", [{**row, "serial_number": "\n".join(serial_numbers)}]).submit()
		invoice.items[0].quantity = 1
		invoice.items[0].serial_number = serial_numbers[0]
		invoice.append("items", {"item": item.name, "quantity": 2})

		invoice.preview()

		self.assertEqual(invoice.items[1].serial_number, "\n".join(serial_numbers[1:]))

	def test_pos_invoice_submit_rejects_serial_numbers_out_of_stock(self):
		invoice, item, _location = self._make_pos_invoice(use_profile=False)
		frappe.db.set_value("Books Item", item.name, "has_serial_number", 1)
		serial_numbers = [unique_name("SN") for _ in range(2)]
		invoice.items[0].serial_number = "\n".join(serial_numbers)
		invoice.save()

		self.assertRaisesRegex(
			frappe.ValidationError, f"{serial_numbers[0]} is not available", invoice.submit
		)

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

	def test_a_duplicate_shipment_is_not_linked_to_the_invoice(self):
		invoice, _item = self._sales_invoice(make_auto_stock_transfer=1)
		invoice.submit()

		shipment = frappe.get_doc("Books Shipment", invoice.reload().back_reference)
		# /books copies a document without the fields its DocType marks no_copy.
		duplicate = frappe.copy_doc(shipment, ignore_no_copy=False)

		self.assertIsNone(duplicate.back_reference)
		self.assertEqual(duplicate.items[0].quantity, 2)

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

		self.assertRaisesRegex(frappe.ValidationError, "Please select a batch first", invoice.save)

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
				"items": [{**shipment.items[0].as_dict(no_default_fields=True), "quantity": -1}],
			}
		)
		return_shipment.insert().submit()

		self.assertRaises(frappe.LinkExistsError, invoice.cancel)

	def test_auto_transfer_requires_a_default_location(self):
		invoice, _item = self._sales_invoice(make_auto_stock_transfer=1)
		frappe.db.set_single_value("Books Defaults", "shipment_location", None)

		self.assertRaisesRegex(frappe.ValidationError, "Set Shipment Location", invoice.submit)

	def test_shipment_maps_only_what_the_invoice_has_not_shipped(self):
		invoice, item = self._sales_invoice(currency=foreign_currency(), exchange_rate=2)
		invoice.submit()
		first = make_shipment(invoice.name)
		first.items[0].update({"quantity": 1, "transfer_quantity": 1})
		first.insert().submit()

		shipment = make_shipment(invoice.name)

		self.assertEqual((shipment.back_reference, shipment.return_against), (invoice.name, None))
		self.assertEqual(
			[(row.item, row.quantity, row.rate, row.location) for row in shipment.items],
			[(item, 1, 200, "Stores")],
		)
		shipment.insert().submit()
		self.assertRaisesRegex(frappe.ValidationError, "no stock left", make_shipment, invoice.name)

	def test_shipment_uses_the_defaults_series(self):
		series = make_number_series("Shipment")
		frappe.db.set_single_value("Books Defaults", "shipment_number_series", series)
		invoice, _item = self._sales_invoice()
		invoice.submit()

		shipment = make_shipment(invoice.name)

		self.assertIsNone(shipment.number_series)
		self.assertTrue(shipment.insert().name.startswith(series), shipment.name)

	def test_receipt_of_a_return_returns_against_the_original_receipt(self):
		invoice, _item = self._purchase_invoice(make_auto_stock_transfer=1)
		invoice.submit()
		purchase_return = make_purchase_return(invoice.name)
		purchase_return.make_auto_stock_transfer = 0
		purchase_return.insert().submit()

		receipt = make_purchase_receipt(purchase_return.name)

		self.assertEqual(receipt.return_against, invoice.reload().back_reference)
		self.assertEqual([row.quantity for row in receipt.items], [-2])

	def test_return_shipment_reverses_the_shipment_made_by_hand(self):
		invoice, _item = self._sales_invoice()
		invoice.submit()
		shipment = make_shipment(invoice.name).insert()
		shipment.submit()
		credit_note = make_sales_return(invoice.name)
		credit_note.insert().submit()

		self.assertEqual(make_shipment(credit_note.name).return_against, shipment.name)

	def _purchase_invoice(self, **values):
		# Inventory is on in tests, so a test asks for the automatic transfer it wants.
		values.setdefault("make_auto_stock_transfer", 0)
		payable = make_account("Map Payable", root_type="Liability", account_type="Payable")
		stock = make_account("Map Stock", account_type="Stock")
		received = make_account("Map Received", root_type="Liability")
		expense = make_account("Map Expense", root_type="Expense")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		set_inventory_accounts(stock.name, received.name, expense.name)
		frappe.db.set_single_value("Books Defaults", "purchase_receipt_location", "Stores")
		item = make_item(make_account("Income", root_type="Income").name, received.name, track_item=1)
		invoice = make_invoice(
			"Books Purchase Invoice",
			make_party(payable.name, role="Supplier").name,
			payable.name,
			item.name,
			received.name,
			**values,
		)
		return invoice, item.name

	def _sales_invoice(self, currency=None, **values):
		# Inventory is on in tests, so a test asks for the automatic transfer it wants.
		values.setdefault("make_auto_stock_transfer", 0)
		receivable = make_account("Auto Receivable", account_type="Receivable")
		income = make_account("Auto Sales", root_type="Income", account_type="Income Account")
		cogs = make_account("Auto COGS", root_type="Expense", account_type="Cost of Goods Sold")
		stock = make_account("Auto Stock", account_type="Stock")
		received = make_account("Auto Received", root_type="Liability")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", cogs.name)
		set_inventory_accounts(stock.name, received.name, cogs.name)
		frappe.db.set_single_value("Books Defaults", "shipment_location", "Stores")
		item = make_item(income.name, received.name, track_item=1, rate=10)
		make_movement(
			"MaterialReceipt",
			[{"item": item.name, "to_location": "Stores", "quantity": 5, "rate": 10}],
		).submit()
		invoice = make_invoice(
			"Books Sales Invoice",
			make_party(receivable.name, currency=currency).name,
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
		item = make_item(make_account("Income", root_type="Income").name, received.name, track_item=1)
		invoice = make_invoice(
			"Books Purchase Invoice",
			make_party(payable.name, role="Supplier", currency=foreign_currency()).name,
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
		item = make_item(make_account("Income", root_type="Income").name, received.name, track_item=1)
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
		start_pos_shift()
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
		item = make_item(income.name, received.name, track_item=1, rate=10)
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
		)
		return invoice, item, location
