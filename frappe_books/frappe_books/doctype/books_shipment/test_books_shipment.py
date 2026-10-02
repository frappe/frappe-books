# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from decimal import Decimal
from unittest.mock import patch

import frappe
from frappe.model.mapper import make_mapped_doc
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, now_datetime

from frappe_books.frappe_books.doctype.books_purchase_receipt.test_books_purchase_receipt import (
	make_receipt,
	stock_value_change,
)
from frappe_books.frappe_books.doctype.books_shipment.books_shipment import make_return, make_sales_invoice
from frappe_books.tests.accounting import (
	ensure_user,
	ledger_entries,
	make_account,
	make_invoice,
	make_item,
	make_party,
	set_inventory_accounts,
	stock_quantity,
	unique_name,
)

READ_ONLY_USER = "books-shipment-preview-reader@example.com"


class IntegrationTestBooksShipment(IntegrationTestCase):
	def test_shipment_removes_stock_posts_cogs_and_reverses(self):
		stock = make_account("Stock", account_type="Stock")
		received = make_account("Received", root_type="Liability")
		cogs = make_account("COGS", root_type="Expense", account_type="Cost of Goods Sold")
		income = make_account("Income", root_type="Income")
		receivable = make_account("Receivable", account_type="Receivable")
		party = make_party(receivable.name)
		item = make_item(income.name, received.name, track_item=1)
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

	def test_return_shipment_posts_the_shipped_cost(self):
		item, cogs, stock = self._tracked_item()
		seed_stock(item.name, quantity=4, rate=10)
		seed_stock(item.name, quantity=2, rate=20)
		shipment = self._make_shipment(item, quantity=5, rate=25)
		shipment.submit()

		return_shipment = self._make_shipment(item, quantity=-1, rate=25, return_against=shipment.name)
		return_shipment.submit()

		entries = ledger_entries(return_shipment.doctype, return_shipment.name)
		stock_entry = next(row for row in entries if row.account == stock.name)
		cogs_entry = next(row for row in entries if row.account == cogs.name)
		self.assertEqual(Decimal(str(stock_entry.debit)), Decimal("12"))
		self.assertEqual(Decimal(str(cogs_entry.credit)), Decimal("12"))
		self.assertEqual(stock_quantity(item.name, "Stores"), 2)
		self.assertEqual(stock_value_change(return_shipment), Decimal("12"))

	def test_return_into_empty_stock_takes_the_shipped_cost(self):
		item, _cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=2, rate=10)
		shipment = self._make_shipment(item, quantity=2, rate=25)
		shipment.submit()

		return_shipment = self._make_shipment(item, quantity=-1, rate=25, return_against=shipment.name)
		return_shipment.submit()

		self.assertEqual(stock_value_change(return_shipment), Decimal("10"))

	def test_shipment_cannot_post_a_stock_value_increase(self):
		item, _cogs, _stock = self._tracked_item()
		# Stock checks keep stock from going negative, so skip them to get there.
		with patch("frappe_books.inventory.transaction.validate_stock_available"):
			self._make_shipment(item, quantity=5, rate=25).submit()
		seed_stock(item.name, quantity=10, rate=10)

		shipment = self._make_shipment(item, quantity=5, rate=25)

		self.assertRaisesRegex(frappe.ValidationError, "the wrong way", shipment.submit)

	def test_backdated_receipt_reposts_later_shipment_cost(self):
		item, cogs, _stock = self._tracked_item()
		now = now_datetime()
		seed_stock(item.name, quantity=5, rate=10, date=add_to_date(now, hours=-2))
		shipment = self._make_shipment(item, quantity=3, rate=25, date=add_to_date(now, hours=-1))
		shipment.submit()

		receipt = make_receipt(item.name, quantity=2, rate=20, date=add_to_date(now, hours=-3))
		self.assertEqual(account_balance(shipment, cogs.name), 50)

		receipt.cancel()
		self.assertEqual(account_balance(shipment, cogs.name), 30)

	def test_restated_shipment_cost_revalues_its_return(self):
		item, cogs, _stock = self._tracked_item()
		now = now_datetime()
		seed_stock(item.name, quantity=5, rate=10, date=add_to_date(now, hours=-3))
		shipment = self._make_shipment(item, quantity=3, rate=25, date=add_to_date(now, hours=-2))
		shipment.submit()
		returned = self._make_shipment(
			item, quantity=-3, rate=25, return_against=shipment.name, date=add_to_date(now, hours=-1)
		)
		returned.submit()

		receipt = make_receipt(item.name, quantity=3, rate=20, date=add_to_date(now, hours=-4))
		self.assertEqual(stock_value_change(returned), 60)
		self.assertEqual(account_balance(returned, cogs.name), -60)

		receipt.cancel()
		self.assertEqual(stock_value_change(returned), 30)
		self.assertEqual(account_balance(returned, cogs.name), -30)

	def test_return_cannot_be_dated_before_its_shipment(self):
		item, _cogs, _stock = self._tracked_item()
		now = now_datetime()
		seed_stock(item.name, quantity=2, rate=10, date=add_to_date(now, hours=-3))
		shipment = self._make_shipment(item, quantity=2, rate=25, date=add_to_date(now, hours=-1))
		shipment.submit()

		self.assertRaisesRegex(
			frappe.ValidationError,
			"cannot be dated before",
			self._make_shipment,
			item,
			quantity=-1,
			rate=25,
			return_against=shipment.name,
			date=add_to_date(now, hours=-2),
		)

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

		return_shipment = self._make_shipment(item, quantity=-1, rate=25, return_against=shipment.name)
		return_shipment.submit()
		self.assertEqual(frappe.db.get_value(shipment.doctype, shipment.name, "is_returned"), 1)

		return_shipment.cancel()
		self.assertEqual(frappe.db.get_value(shipment.doctype, shipment.name, "is_returned"), 0)

	def test_shipped_serial_numbers_are_delivered_until_cancelled(self):
		item, _cogs, _stock = self._tracked_item()
		frappe.db.set_value("Books Item", item.name, "has_serial_number", 1)
		serials = ["SHIP-A " + item.name, "SHIP-B " + item.name]
		seed_stock(item.name, quantity=2, rate=10, serial_number="\n".join(serials))
		shipment = frappe.get_doc(
			{
				"doctype": "Books Shipment",
				"party": make_party(make_account("Receivable", account_type="Receivable").name).name,
				"date": now_datetime(),
				"items": [
					{
						"item": item.name,
						"location": "Stores",
						"quantity": 2,
						"rate": 25,
						"serial_number": "\n".join(serials),
					}
				],
			}
		).insert()
		shipment.submit()
		self.assertEqual(serial_statuses(serials), {"Delivered"})

		shipment.cancel()
		self.assertEqual(serial_statuses(serials), {"Active"})

	def test_returned_serial_numbers_are_delivered_again_when_the_return_is_cancelled(self):
		item, _cogs, _stock = self._tracked_item(has_serial_number=1)
		serial = unique_name("SER")
		seed_stock(item.name, quantity=1, rate=10, serial_number=serial)
		shipment = self._make_shipment(
			item, quantity=1, rate=25, items=[self._row(item, 1, serial_number=serial)]
		)
		shipment.submit()
		returned = self._return_serial(item, shipment, serial)
		returned.submit()
		self.assertEqual(serial_statuses([serial]), {"Active"})

		returned.cancel()
		self.assertEqual(serial_statuses([serial]), {"Delivered"})

	def test_return_cannot_take_back_more_than_was_shipped(self):
		item, _cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=3, rate=10)
		shipment = self._make_shipment(item, quantity=3, rate=25)
		shipment.submit()
		self._make_shipment(item, quantity=-2, rate=25, return_against=shipment.name).submit()

		with self.assertRaisesRegex(frappe.ValidationError, "exceed the quantity of 3"):
			self._make_shipment(item, quantity=-2, rate=25, return_against=shipment.name)

	def test_return_takes_back_only_the_shipped_batch_quantity(self):
		item, _cogs, _stock = self._tracked_item(has_batch=1)
		batches = [make_batch(item.name), make_batch(item.name)]
		for batch in batches:
			seed_stock(item.name, quantity=2, rate=10, batch=batch)
		shipment = self._make_shipment(
			item, quantity=2, rate=25, items=[self._row(item, 1, batch) for batch in batches]
		)
		shipment.submit()

		with self.assertRaisesRegex(frappe.ValidationError, rf"\({batches[1]}\) exceed"):
			self._make_shipment(
				item,
				quantity=2,
				rate=25,
				return_against=shipment.name,
				items=[self._row(item, -2, batches[1])],
			)

	def test_return_takes_back_only_shipped_serial_numbers(self):
		item, _cogs, _stock = self._tracked_item(has_serial_number=1)
		serials = [unique_name("SER") for _ in range(3)]
		seed_stock(item.name, quantity=3, rate=10, serial_number="\n".join(serials))
		shipment = self._make_shipment(
			item, quantity=2, rate=25, items=[self._row(item, 2, serial_number="\n".join(serials[:2]))]
		)
		shipment.submit()

		with self.assertRaisesRegex(frappe.ValidationError, f"{serials[2]} is not in"):
			self._return_serial(item, shipment, serials[2])
		self._return_serial(item, shipment, serials[0]).submit()
		with self.assertRaisesRegex(frappe.ValidationError, f"{serials[0]} is already returned"):
			self._return_serial(item, shipment, serials[0])

	def test_returns_take_quantities_back_and_other_shipments_send_them(self):
		item, _cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=2, rate=10)
		shipment = self._make_shipment(item, quantity=-2, rate=25)
		shipment.submit()

		returned = self._make_shipment(item, quantity=1, rate=25, return_against=shipment.name)

		self.assertEqual((shipment.items[0].quantity, shipment.items[0].transfer_quantity), (2, 2))
		self.assertEqual((returned.items[0].quantity, returned.items[0].transfer_quantity), (-1, -1))

	def test_rows_without_quantities_move_one_of_their_unit(self):
		item, _cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=2, rate=10)
		shipment = self._make_shipment(item, quantity=None, rate=25)
		shipment.submit()

		returned = self._make_shipment(item, quantity=None, rate=25, return_against=shipment.name)

		self.assertEqual((shipment.items[0].quantity, shipment.items[0].transfer_quantity), (1, 1))
		self.assertEqual((returned.items[0].quantity, returned.items[0].transfer_quantity), (-1, -1))

	def test_preview_fills_what_a_save_would_without_saving(self):
		item, _cogs, _stock = self._tracked_item(has_serial_number=1, hsn_code="123456")
		serial_numbers = [unique_name("SN"), unique_name("SN")]
		seed_stock(item.name, quantity=2, rate=10, serial_number="\n".join(serial_numbers))
		frappe.db.set_single_value("Books Inventory Settings", "default_location", "Stores")
		frappe.db.set_single_value("Books Defaults", "shipment_terms", "Ships in a week")
		shipment = frappe.get_doc(
			{"doctype": "Books Shipment", "items": [{"item": item.name, "quantity": 2, "rate": 25}]}
		)
		shipment.set("__islocal", 1)

		shipment.preview()

		row = shipment.items[0]
		self.assertEqual((shipment.number_series, shipment.terms), ("SHPM-", "Ships in a week"))
		self.assertEqual((row.location, row.hsn_code, row.amount), ("Stores", 123456, 50))
		self.assertEqual(row.serial_number.splitlines(), sorted(serial_numbers))
		self.assertEqual(shipment.grand_total, 50)
		self.assertIsNone(shipment.name)

	def test_preview_needs_the_right_to_make_shipments(self):
		shipment = frappe.new_doc("Books Shipment")
		with self.set_user(ensure_user(READ_ONLY_USER)), self.assertRaises(frappe.PermissionError):
			shipment.preview()

	def test_shipments_take_only_items_kept_for_sales(self):
		item, _cogs, _stock = self._tracked_item(item_usage="Purchases")
		seed_stock(item.name, quantity=1, rate=10)

		with self.assertRaisesRegex(frappe.ValidationError, "is not for Sales"):
			self._make_shipment(item, quantity=1, rate=25)

	def test_rows_default_to_the_inventory_location(self):
		item, _cogs, _stock = self._tracked_item()
		frappe.db.set_single_value("Books Inventory Settings", "default_location", "Stores")
		shipment = self._make_shipment(item, quantity=1, rate=25, items=[{"item": item.name, "quantity": 1}])

		self.assertEqual(shipment.items[0].location, "Stores")

	def test_empty_serial_numbers_are_the_earliest_in_stock_at_the_row_location(self):
		item, _cogs, _stock = self._tracked_item(has_serial_number=1)
		shelf = frappe.get_doc({"doctype": "Books Location", "name": unique_name("Shelf")}).insert().name
		serials = [unique_name("SER") for _ in range(3)]
		now = now_datetime()
		seed_stock(item.name, quantity=1, rate=10, serial_number=serials[0], date=add_to_date(now, hours=-3))
		for serial_number, hours in ((serials[2], -1), (serials[1], -2)):
			row = {"item": item.name, "to_location": shelf, "quantity": 1, "rate": 10}
			movement = frappe.get_doc(
				{
					"doctype": "Books Stock Movement",
					"movement_type": "MaterialReceipt",
					"date": add_to_date(now, hours=hours),
					"items": [{**row, "serial_number": serial_number}],
				}
			).insert()
			movement.submit()

		shipment = self._make_shipment(
			item, quantity=1, rate=25, items=[{"item": item.name, "location": shelf, "quantity": 1}]
		)

		self.assertEqual(shipment.items[0].serial_number, serials[1])

	def test_return_must_reference_a_submitted_original(self):
		item, _cogs, _stock = self._tracked_item()
		draft = self._make_shipment(item, quantity=1, rate=25)

		with self.assertRaisesRegex(frappe.ValidationError, "submitted original"):
			self._make_shipment(item, quantity=-1, rate=25, return_against=draft.name)

	def test_invoice_bills_a_shipment_without_shipping_again(self):
		item, _cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=3, rate=10)
		shipment = self._make_shipment(item, quantity=2, rate=25)
		shipment.submit()

		invoice = make_sales_invoice(shipment.name)

		self.assertEqual(
			(invoice.doctype, invoice.party, invoice.back_reference),
			("Books Sales Invoice", shipment.party, shipment.name),
		)
		self.assertEqual([(row.item, row.quantity, row.rate) for row in invoice.items], [(item.name, 2, 25)])
		self.assertEqual(invoice.grand_total, 50)
		invoice.make_auto_stock_transfer = 1
		invoice.insert().submit()
		self.assertEqual(stock_quantity(item.name, "Stores"), 1)

	def test_invoices_bill_a_shipment_only_up_to_what_it_shipped(self):
		item, _cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=3, rate=10)
		shipment = self._make_shipment(item, quantity=2, rate=25)
		shipment.submit()
		first = make_sales_invoice(shipment.name).insert()
		second = make_sales_invoice(shipment.name).insert()

		first.submit()

		self.assertRaisesRegex(frappe.ValidationError, "exceed the quantity of 2", second.submit)
		first.cancel()
		second.reload().submit()

	def test_invoice_maps_what_earlier_invoices_left_to_bill(self):
		item, _cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=3, rate=10)
		shipment = self._make_shipment(item, quantity=3, rate=25)
		shipment.submit()
		first = make_sales_invoice(shipment.name)
		first.items[0].update({"quantity": 2, "transfer_quantity": 2})
		first.insert().submit()

		self.assertEqual([row.quantity for row in make_sales_invoice(shipment.name).items], [1])
		make_sales_invoice(shipment.name).insert().submit()
		self.assertRaisesRegex(
			frappe.ValidationError, "already fully billed", make_sales_invoice, shipment.name
		)

	def test_shipment_is_fully_billed_until_an_invoice_is_cancelled(self):
		item, _cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=2, rate=10)
		shipment = self._make_shipment(item, quantity=2, rate=25)
		shipment.submit()
		first = make_sales_invoice(shipment.name)
		first.items[0].update({"quantity": 1, "transfer_quantity": 1})
		first.insert().submit()
		self.assertEqual(shipment.db_get("is_fully_billed"), 0)

		second = make_sales_invoice(shipment.name).insert()
		second.submit()
		self.assertEqual(shipment.db_get("is_fully_billed"), 1)

		second.cancel()
		self.assertEqual(shipment.db_get("is_fully_billed"), 0)

	def test_invoice_of_a_shipment_can_bill_lines_it_did_not_ship(self):
		item, cogs, _stock = self._tracked_item()
		service = make_item(item.income_account, cogs.name)
		seed_stock(item.name, quantity=2, rate=10)
		shipment = self._make_shipment(item, quantity=2, rate=25)
		shipment.submit()
		invoice = make_sales_invoice(shipment.name)
		invoice.append("items", {"item": service.name, "quantity": 1, "rate": 5})

		invoice.insert().submit()

		self.assertEqual(invoice.docstatus, 1)

	def test_shipment_made_from_an_invoice_is_not_billed_again(self):
		item, cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=5, rate=10)
		invoice = self._make_invoice(item, cogs)
		shipment = self._make_shipment(item, quantity=2, rate=100, back_reference=invoice.name)
		shipment.submit()

		self.assertRaisesRegex(frappe.ValidationError, "made from invoice", make_sales_invoice, shipment.name)

	def test_return_of_an_invoiced_shipment_leaves_the_invoice_balance(self):
		item, cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=5, rate=10)
		invoice = self._make_invoice(item, cogs)
		shipment = self._make_shipment(item, quantity=2, rate=100, back_reference=invoice.name)
		shipment.submit()

		shipment_return = make_return(shipment.name)

		self.assertEqual(
			(shipment_return.return_against, shipment_return.back_reference), (shipment.name, None)
		)
		self.assertEqual([row.quantity for row in shipment_return.items], [-2])
		shipment_return.insert().submit()
		self.assertEqual(stock_quantity(item.name, "Stores"), 5)
		self.assertEqual(transfer_balance(invoice), [0, 0])

	def test_return_offers_only_what_earlier_returns_left(self):
		item, _cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=3, rate=10)
		shipment = self._make_shipment(item, quantity=3, rate=25)
		shipment.submit()
		first = make_return(shipment.name)
		first.items[0].update({"quantity": -1, "transfer_quantity": -1})
		first.insert().submit()

		second = make_return(shipment.name)

		self.assertEqual([row.quantity for row in second.items], [-2])
		second.insert().submit()
		self.assertRaisesRegex(frappe.ValidationError, "fully returned", make_return, shipment.name)

	def test_frappe_mapper_makes_shipment_returns(self):
		item, _cogs, _stock = self._tracked_item()
		seed_stock(item.name, quantity=1, rate=10)
		shipment = self._make_shipment(item, quantity=1, rate=25)
		shipment.submit()
		method = "frappe_books.frappe_books.doctype.books_shipment.books_shipment.make_return"

		shipment_return = make_mapped_doc(method, shipment.name)

		self.assertEqual(shipment_return.return_against, shipment.name)
		self.assertEqual(shipment_return.items[0].quantity, -1)

	def _return_serial(self, item, shipment, serial_number):
		return self._make_shipment(
			item,
			quantity=1,
			rate=25,
			return_against=shipment.name,
			items=[self._row(item, -1, serial_number=serial_number)],
		)

	def _row(self, item, quantity, batch=None, serial_number=None):
		row = {"item": item.name, "location": "Stores", "quantity": quantity, "rate": 25}
		return {**row, "batch": batch, "serial_number": serial_number}

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

	def _tracked_item(self, **values):
		stock = make_account("Stock", account_type="Stock")
		received = make_account("Received", root_type="Liability")
		cogs = make_account("COGS", root_type="Expense", account_type="Cost of Goods Sold")
		income = make_account("Income", root_type="Income")
		set_inventory_accounts(stock.name, received.name, cogs.name)
		return make_item(income.name, received.name, track_item=1, **values), cogs, stock

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


def seed_stock(item, quantity, rate, serial_number=None, batch=None, date=None):
	row = {"item": item, "to_location": "Stores", "quantity": quantity, "rate": rate, "batch": batch}
	movement = frappe.get_doc(
		{
			"doctype": "Books Stock Movement",
			"movement_type": "MaterialReceipt",
			"date": date or now_datetime(),
			"items": [{**row, "serial_number": serial_number}],
		}
	).insert(ignore_permissions=True)
	movement.submit()


def make_batch(item):
	return (
		frappe.get_doc({"doctype": "Books Batch", "name": unique_name("BATCH"), "item": item}).insert().name
	)


def account_balance(voucher, account):
	entries = ledger_entries(voucher.doctype, voucher.name)
	return sum(
		Decimal(str(row.debit)) - Decimal(str(row.credit)) for row in entries if row.account == account
	)


def serial_statuses(serial_numbers):
	return set(
		frappe.get_all("Books Serial Number", filters={"name": ["in", serial_numbers]}, pluck="status")
	)


def transfer_balance(invoice):
	"""Return the invoice's and its first row's quantity still to transfer."""
	invoice.reload()
	return [invoice.stock_not_transferred, invoice.items[0].stock_not_transferred]
