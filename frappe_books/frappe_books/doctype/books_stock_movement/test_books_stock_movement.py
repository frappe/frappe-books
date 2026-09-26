# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import now_datetime

from frappe_books.inventory.stock import stock_quantity
from frappe_books.tests.accounting import make_account, make_item, unique_name


class IntegrationTestBooksStockMovement(IntegrationTestCase):
	def setUp(self):
		income = make_account("Income", root_type="Income")
		expense = make_account("Expense", root_type="Expense")
		self.item = make_item(income.name, expense.name, track_item=1)
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


def make_movement(movement_type, items):
	return frappe.get_doc(movement_values(movement_type, items)).insert()


def movement_values(movement_type, items):
	return {
		"doctype": "Books Stock Movement",
		"movement_type": movement_type,
		"date": now_datetime(),
		"items": items,
	}
