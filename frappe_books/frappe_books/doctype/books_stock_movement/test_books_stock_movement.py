# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import re
from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, now_datetime

from frappe_books.series import default_series
from frappe_books.tests.accounting import (
	ensure_user,
	ledger_entries,
	make_account,
	make_item,
	stock_quantity,
	unique_name,
)

READ_ONLY_USER = "books-movement-preview-reader@example.com"


class IntegrationTestBooksStockMovement(IntegrationTestCase):
	def setUp(self):
		income = make_account("Income", root_type="Income")
		received = make_account("Received", root_type="Liability")
		self.item = make_item(income.name, received.name, track_item=1)
		self.warehouse = frappe.get_doc(
			{"doctype": "Books Location", "name": unique_name("Warehouse")}
		).insert()

	def test_receipt_transfer_availability_and_cancel(self):
		receipt = make_movement(
			"MaterialReceipt",
			[{"item": self.item.name, "to_location": "Stores", "quantity": 5, "rate": 10}],
		)
		receipt.submit()
		self.assertEqual(stock_quantity(self.item.name, "Stores"), 5)

		transfer = make_movement(
			"MaterialTransfer",
			[
				{
					"item": self.item.name,
					"from_location": "Stores",
					"to_location": self.warehouse.name,
					"quantity": 3,
					"rate": 10,
				}
			],
		)
		transfer.submit()
		self.assertEqual(stock_quantity(self.item.name, "Stores"), 2)
		self.assertEqual(stock_quantity(self.item.name, self.warehouse.name), 3)

		issue = make_movement(
			"MaterialIssue",
			[{"item": self.item.name, "from_location": "Stores", "quantity": 3, "rate": 10}],
		)
		self.assertRaises(frappe.ValidationError, issue.submit)

		transfer.cancel()
		self.assertEqual(stock_quantity(self.item.name, "Stores"), 5)
		self.assertEqual(stock_quantity(self.item.name, self.warehouse.name), 0)

	def test_rows_together_cannot_exceed_available_stock(self):
		self._receive(6)
		issue = make_movement(
			"MaterialIssue",
			[{"item": self.item.name, "from_location": "Stores", "quantity": 5, "rate": 10}] * 2,
		)

		message = f"Insufficient stock for {self.item.name} in Stores. Available: 6; required: 10."
		self.assertRaisesRegex(frappe.ValidationError, re.escape(message), issue.submit)
		self.assertEqual(stock_quantity(self.item.name, "Stores"), 6)

	def test_serial_number_cannot_repeat_in_a_row(self):
		item = self._serial_item()
		receipt = frappe.get_doc(
			movement_values(
				"MaterialReceipt",
				[
					{
						"item": item,
						"to_location": "Stores",
						"quantity": 2,
						"rate": 5,
						"serial_number": "S1\nS1",
					}
				],
			)
		)

		self.assertRaisesRegex(frappe.ValidationError, "more than once", receipt.insert)

	def test_serial_numbers_must_match_the_quantity(self):
		item = self._serial_item()
		row = {"item": item, "from_location": "Stores", "quantity": 2, "rate": 5, "serial_number": "S1"}
		issue = frappe.get_doc(movement_values("MaterialIssue", [row]))

		message = f"Need 2 Serial Numbers for Item {item}. You have provided 1"
		self.assertRaisesRegex(frappe.ValidationError, re.escape(message), issue.insert)

	def test_serial_number_cannot_repeat_across_rows(self):
		item = self._serial_item()
		row = {"item": item, "to_location": "Stores", "quantity": 1, "rate": 5, "serial_number": "S1"}
		receipt = frappe.get_doc(movement_values("MaterialReceipt", [row, row]))

		self.assertRaisesRegex(frappe.ValidationError, "more than once", receipt.insert)

	def test_receipt_cannot_be_cancelled_once_its_stock_is_used(self):
		receipt = self._receive(10)
		make_movement(
			"MaterialIssue",
			[{"item": self.item.name, "from_location": "Stores", "quantity": 8, "rate": 10}],
		).submit()

		self.assertRaisesRegex(frappe.ValidationError, "Insufficient stock", receipt.cancel)
		self.assertEqual(stock_quantity(self.item.name, "Stores"), 2)

	def test_receipt_cannot_be_cancelled_once_its_serial_number_left(self):
		item = self._serial_item()
		sold, kept = unique_name("SER"), unique_name("SER")
		receipt = self._receive_serial(item, sold)
		self._receive_serial(item, kept)
		make_movement(
			"MaterialIssue",
			[{"item": item, "from_location": "Stores", "quantity": 1, "rate": 5, "serial_number": sold}],
		).submit()

		self.assertRaisesRegex(frappe.ValidationError, "not available", receipt.cancel)

	def test_batch_is_rejected_for_an_item_without_batches(self):
		batch = frappe.get_doc(
			{"doctype": "Books Batch", "name": unique_name("BATCH"), "item": self.item.name}
		).insert()
		receipt = frappe.get_doc(
			movement_values(
				"MaterialReceipt",
				[
					{
						"item": self.item.name,
						"to_location": "Stores",
						"quantity": 1,
						"rate": 5,
						"batch": batch.name,
					}
				],
			)
		)

		self.assertRaisesRegex(frappe.ValidationError, "does not use batches", receipt.insert)

	def test_serial_numbers_are_rejected_for_an_item_without_them(self):
		row = {"item": self.item.name, "to_location": "Stores", "quantity": 2, "rate": 5}
		receipt = frappe.get_doc(movement_values("MaterialReceipt", [{**row, "serial_number": "S1"}]))

		self.assertRaisesRegex(frappe.ValidationError, "does not use serial numbers", receipt.insert)

	def test_serial_number_of_another_item_is_rejected(self):
		serial_number = unique_name("SER")
		self._receive_serial(self._serial_item(), serial_number)
		row = {"item": self._serial_item(), "to_location": "Stores", "quantity": 1, "rate": 5}
		receipt = frappe.get_doc(
			movement_values("MaterialReceipt", [{**row, "serial_number": serial_number}])
		)

		self.assertRaisesRegex(frappe.ValidationError, "belongs to another item", receipt.insert)

	def test_serial_number_in_stock_cannot_be_received_again(self):
		item, serial_number = self._serial_item(), unique_name("SER")
		self._receive_serial(item, serial_number)

		self.assertRaisesRegex(
			frappe.ValidationError, "already in stock", self._receive_serial, item, serial_number
		)

	def _receive_serial(self, item, serial_number):
		receipt = make_movement(
			"MaterialReceipt",
			[
				{
					"item": item,
					"to_location": "Stores",
					"quantity": 1,
					"rate": 5,
					"serial_number": serial_number,
				}
			],
		)
		receipt.submit()
		return receipt

	def _receive(self, quantity):
		receipt = make_movement(
			"MaterialReceipt",
			[{"item": self.item.name, "to_location": "Stores", "quantity": quantity, "rate": 10}],
		)
		receipt.submit()
		return receipt

	def _serial_item(self):
		return make_item(
			self.item.income_account,
			self.item.expense_account,
			track_item=1,
			has_serial_number=1,
		).name

	def test_batch_and_serial_numbers_follow_stock(self):
		tracked_item = make_item(
			self.item.income_account,
			self.item.expense_account,
			track_item=1,
			has_batch=1,
			has_serial_number=1,
		)
		batch = unique_name("BATCH")
		frappe.get_doc({"doctype": "Books Batch", "name": batch, "item": tracked_item.name}).insert()
		serials = f"{unique_name('SER')}\n{unique_name('SER')}"
		receipt = make_movement(
			"MaterialReceipt",
			[
				{
					"item": tracked_item.name,
					"to_location": "Stores",
					"quantity": 2,
					"rate": 12,
					"batch": batch,
					"serial_number": serials,
				}
			],
		)
		receipt.submit()

		self.assertEqual(frappe.db.get_value("Books Batch", batch, "item"), tracked_item.name)
		for serial_number in serials.splitlines():
			self.assertEqual(frappe.db.get_value("Books Serial Number", serial_number, "status"), "Active")

	def test_receipt_requires_an_existing_batch(self):
		tracked_item = make_item(
			self.item.income_account,
			self.item.expense_account,
			track_item=1,
			has_batch=1,
		)
		receipt = frappe.get_doc(
			movement_values(
				"MaterialReceipt",
				[
					{
						"item": tracked_item.name,
						"to_location": "Stores",
						"quantity": 2,
						"rate": 12,
						"batch": unique_name("NEW-BATCH"),
					}
				],
			)
		)

		self.assertRaises(frappe.LinkValidationError, receipt.insert)

	def test_a_save_returns_the_batch_the_server_named(self):
		prefix = f"B{frappe.generate_hash(length=6)}-"
		item = make_item(
			self.item.income_account,
			self.item.expense_account,
			track_item=1,
			has_batch=1,
			batch_series=prefix,
		).name
		row = {"item": item, "to_location": "Stores", "quantity": 2, "rate": 12}

		movement = frappe.get_doc(movement_values("MaterialReceipt", [row])).insert()

		self.assertEqual(movement.items[0].batch, f"{prefix}1001")

	def test_untracked_item_cannot_move_stock(self):
		expense = make_account("Service Expense", root_type="Expense")
		item = make_item(self.item.income_account, expense.name).name
		receipt = frappe.get_doc(
			movement_values(
				"MaterialReceipt", [{"item": item, "to_location": "Stores", "quantity": 1, "rate": 10}]
			)
		)

		self.assertRaisesRegex(frappe.ValidationError, "does not track stock", receipt.insert)

	def test_rows_default_to_the_inventory_location(self):
		frappe.db.set_single_value("Books Inventory Settings", "default_location", self.warehouse.name)
		row = {"item": self.item.name, "quantity": 1, "rate": 10}
		receipt = make_movement("MaterialReceipt", [row])
		issue = make_movement("MaterialIssue", [row])

		self.assertEqual(receipt.items[0].to_location, self.warehouse.name)
		self.assertEqual(issue.items[0].from_location, self.warehouse.name)

	def test_issues_and_receipts_keep_only_the_location_they_use(self):
		frappe.db.set_single_value("Books Inventory Settings", "default_location", self.warehouse.name)
		row = {"item": self.item.name, "from_location": "Stores", "to_location": "Stores", "quantity": 1}
		receipt = make_movement("MaterialReceipt", [row])
		issue = frappe.get_doc(movement_values("MaterialIssue", [{**row, "from_location": None}]))
		issue.calculate()

		self.assertEqual((receipt.items[0].from_location, receipt.items[0].to_location), (None, "Stores"))
		self.assertEqual(
			(issue.items[0].from_location, issue.items[0].to_location), (self.warehouse.name, None)
		)

	def test_preview_fills_what_a_save_would_without_saving(self):
		frappe.db.set_single_value("Books Inventory Settings", "default_location", self.warehouse.name)
		self.item.db_set("rate", 15)
		movement = frappe.get_doc(
			movement_values("MaterialReceipt", [{"item": self.item.name, "quantity": 2}])
		)

		movement.preview()

		row = movement.items[0]
		self.assertEqual(movement.number_series, default_series("Books Stock Movement"))
		self.assertEqual(
			(row.to_location, row.rate, row.amount, row.unit), (self.warehouse.name, 15, 30, "Unit")
		)
		self.assertEqual(movement.amount, 30)
		self.assertIsNone(movement.name)

	def test_preview_needs_the_right_to_make_movements(self):
		movement = frappe.get_doc(movement_values("MaterialReceipt", []))
		with self.set_user(ensure_user(READ_ONLY_USER)), self.assertRaises(frappe.PermissionError):
			movement.preview()

	def test_receipt_names_missing_serial_numbers_from_the_item_series(self):
		prefix = f"S{frappe.generate_hash(length=6)}-"
		item = make_item(
			self.item.income_account,
			self.item.expense_account,
			track_item=1,
			has_serial_number=1,
			serial_number_series=prefix,
		).name

		receipt = make_movement("MaterialReceipt", [{"item": item, "to_location": "Stores", "quantity": 2}])

		self.assertEqual(receipt.items[0].serial_number.splitlines(), [f"{prefix}1001", f"{prefix}1002"])

	def test_manufacture_row_cannot_both_consume_and_produce(self):
		row = {"item": self.item.name, "quantity": 1, "rate": 10}
		manufacture = frappe.get_doc(
			movement_values(
				"Manufacture",
				[
					{**row, "from_location": "Stores"},
					{**row, "from_location": "Stores", "to_location": self.warehouse.name},
				],
			)
		)

		self.assertRaisesRegex(frappe.ValidationError, "Only From or To", manufacture.insert)


class IntegrationTestStockMovementPostings(IntegrationTestCase):
	"""A movement moves its net stock value between Stock In Hand and Stock Adjustment."""

	def setUp(self):
		income = make_account("Income", root_type="Income")
		received = make_account("Received", root_type="Liability")
		self.item = make_item(income.name, received.name, track_item=1).name
		self.product = make_item(income.name, received.name, track_item=1).name
		self.stock = make_account("Stock", account_type="Stock").name
		self.adjustment = make_account(
			"Adjustment", root_type="Expense", account_type="Stock Adjustment"
		).name
		frappe.db.set_single_value(
			"Books Inventory Settings", {"stock_in_hand": self.stock, "stock_adjustment": self.adjustment}
		)
		self.shop = frappe.get_doc({"doctype": "Books Location", "name": unique_name("Shop")}).insert().name

	def test_each_movement_type_posts_its_net_stock_value(self):
		receipt = self.submit("MaterialReceipt", [self.row(4, 10, to_location="Stores")])
		issue = self.submit("MaterialIssue", [self.row(1, 99, from_location="Stores")])
		transfer = self.submit(
			"MaterialTransfer", [self.row(1, 99, from_location="Stores", to_location=self.shop)]
		)
		consumed = self.row(2, 99, from_location="Stores")
		manufacture = self.submit(
			"Manufacture", [consumed, {**self.row(1, 30, to_location="Stores"), "item": self.product}]
		)

		self.assertEqual(self.balances(receipt), {self.stock: Decimal(40), self.adjustment: Decimal(-40)})
		self.assertEqual(self.balances(issue), {self.stock: Decimal(-10), self.adjustment: Decimal(10)})
		self.assertEqual(ledger_entries(transfer.doctype, transfer.name), [])
		self.assertEqual(self.balances(manufacture), {self.stock: Decimal(10), self.adjustment: Decimal(-10)})

	def test_cancelling_a_movement_reverses_its_entries(self):
		receipt = self.submit("MaterialReceipt", [self.row(4, 10, to_location="Stores")])

		receipt.cancel()

		self.assertEqual(self.balances(receipt), {self.stock: Decimal(0), self.adjustment: Decimal(0)})
		self.assertTrue(all(entry.reverted for entry in ledger_entries(receipt.doctype, receipt.name)))

	def test_a_restated_movement_posts_its_new_value(self):
		now = now_datetime()
		self.submit("MaterialReceipt", [self.row(5, 10, to_location="Stores")], add_to_date(now, hours=-2))
		issue = self.submit(
			"MaterialIssue", [self.row(3, 10, from_location="Stores")], add_to_date(now, hours=-1)
		)

		self.submit("MaterialReceipt", [self.row(2, 20, to_location="Stores")], add_to_date(now, hours=-3))

		self.assertEqual(self.balances(issue), {self.stock: Decimal(-50), self.adjustment: Decimal(50)})

	def test_a_restated_transfer_passes_its_new_cost_on(self):
		now = now_datetime()
		warehouse = frappe.get_doc({"doctype": "Books Location", "name": unique_name("Warehouse")}).insert()
		self.submit("MaterialReceipt", [self.row(5, 10, to_location="Stores")], add_to_date(now, hours=-4))
		first = self.submit(
			"MaterialTransfer",
			[self.row(3, 99, from_location="Stores", to_location=self.shop)],
			add_to_date(now, hours=-3),
		)
		second = self.submit(
			"MaterialTransfer",
			[self.row(3, 99, from_location=self.shop, to_location=warehouse.name)],
			add_to_date(now, hours=-2),
		)
		issue = self.submit(
			"MaterialIssue", [self.row(3, 99, from_location=warehouse.name)], add_to_date(now, hours=-1)
		)

		self.submit("MaterialReceipt", [self.row(2, 20, to_location="Stores")], add_to_date(now, hours=-5))

		self.assertEqual(ledger_entries(first.doctype, first.name), [])
		self.assertEqual(ledger_entries(second.doctype, second.name), [])
		self.assertEqual(self.balances(issue), {self.stock: Decimal(-50), self.adjustment: Decimal(50)})

	def row(self, quantity, rate, **locations):
		return {"item": self.item, "quantity": quantity, "rate": rate, **locations}

	def submit(self, movement_type, items, date=None):
		movement = frappe.get_doc({**movement_values(movement_type, items), "date": date or now_datetime()})
		movement.insert().submit()
		return movement

	def balances(self, movement):
		balances = {}
		for entry in ledger_entries(movement.doctype, movement.name):
			balance = balances.get(entry.account, Decimal(0))
			balances[entry.account] = balance + Decimal(str(entry.debit)) - Decimal(str(entry.credit))
		return balances


def make_movement(movement_type, items):
	return frappe.get_doc(movement_values(movement_type, items)).insert()


def movement_values(movement_type, items):
	return {
		"doctype": "Books Stock Movement",
		"movement_type": movement_type,
		"date": now_datetime(),
		"items": items,
	}
