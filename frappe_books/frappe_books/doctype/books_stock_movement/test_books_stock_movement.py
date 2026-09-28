# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from datetime import datetime

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import convert_utc_to_system_timezone, now, now_datetime

from frappe_books.tests.accounting import make_account, make_item, stock_quantity, unique_name
from frappe_books.ui_bridge.database import BooksDatabaseBridge


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

		self.assertRaisesRegex(frappe.ValidationError, "Insufficient stock", issue.submit)
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

	def test_interface_saves_refuse_unknown_batches(self):
		item = make_item(self.item.income_account, self.item.expense_account, track_item=1, has_batch=1).name
		row = {"item": item, "toLocation": "Stores", "quantity": 2, "rate": 12, "batch": unique_name("NEW")}

		self.assertRaises(
			frappe.LinkValidationError,
			BooksDatabaseBridge().insert,
			"StockMovement",
			{"movementType": "MaterialReceipt", "date": now(), "items": [row]},
		)

	def test_interface_saves_return_the_batch_the_server_named(self):
		prefix = f"B{frappe.generate_hash(length=6)}-"
		item = make_item(
			self.item.income_account,
			self.item.expense_account,
			track_item=1,
			has_batch=1,
			batch_series=prefix,
		).name
		row = {"item": item, "toLocation": "Stores", "quantity": 2, "rate": 12}

		movement = BooksDatabaseBridge().insert(
			"StockMovement", {"movementType": "MaterialReceipt", "date": now(), "items": [row]}
		)

		self.assertEqual(movement["items"][0]["batch"], f"{prefix}1001")

	def test_interface_datetimes_are_stored_in_system_time(self):
		row = {"item": self.item.name, "toLocation": "Stores", "quantity": 1, "rate": 10}
		movement = BooksDatabaseBridge().insert(
			"StockMovement",
			{"movementType": "MaterialReceipt", "date": "2031-01-01T00:00:00Z", "items": [row]},
		)

		stored = frappe.db.get_value("Books Stock Movement", movement["name"], "date")
		self.assertEqual(stored, convert_utc_to_system_timezone(datetime(2031, 1, 1)).replace(tzinfo=None))

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


def make_movement(movement_type, items):
	return frappe.get_doc(movement_values(movement_type, items)).insert()


def movement_values(movement_type, items):
	return {
		"doctype": "Books Stock Movement",
		"movement_type": movement_type,
		"date": now_datetime(),
		"items": items,
	}
