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
	make_warehouse,
	posting_values,
	set_company_value,
	stock_quantity,
	unique_name,
)

READ_ONLY_USER = "books-stock-entry-preview-reader@example.com"


class IntegrationTestBooksStockEntry(IntegrationTestCase):
	def setUp(self):
		income = make_account("Income", root_type="Income")
		received = make_account("Received", root_type="Liability")
		self.item = make_item(income.name, received.name, is_stock_item=1)
		self.warehouse = make_warehouse("Warehouse")

	def test_receipt_transfer_availability_and_cancel(self):
		receipt = make_movement(
			"Material Receipt",
			[{"item_code": self.item.name, "t_warehouse": "Stores", "qty": 5, "basic_rate": 10}],
		)
		receipt.submit()
		self.assertEqual(stock_quantity(self.item.name, "Stores"), 5)

		transfer = make_movement(
			"Material Transfer",
			[
				{
					"item_code": self.item.name,
					"s_warehouse": "Stores",
					"t_warehouse": self.warehouse.name,
					"qty": 3,
					"basic_rate": 10,
				}
			],
		)
		transfer.submit()
		self.assertEqual(stock_quantity(self.item.name, "Stores"), 2)
		self.assertEqual(stock_quantity(self.item.name, self.warehouse.name), 3)

		issue = make_movement(
			"Material Issue",
			[{"item_code": self.item.name, "s_warehouse": "Stores", "qty": 3, "basic_rate": 10}],
		)
		self.assertRaises(frappe.ValidationError, issue.submit)

		transfer.cancel()
		self.assertEqual(stock_quantity(self.item.name, "Stores"), 5)
		self.assertEqual(stock_quantity(self.item.name, self.warehouse.name), 0)

	def test_rows_together_cannot_exceed_available_stock(self):
		self._receive(6)
		issue = make_movement(
			"Material Issue",
			[{"item_code": self.item.name, "s_warehouse": "Stores", "qty": 5, "basic_rate": 10}] * 2,
		)

		message = f"Insufficient stock for {self.item.name} in Stores. Available: 6; required: 10."
		self.assertRaisesRegex(frappe.ValidationError, re.escape(message), issue.submit)
		self.assertEqual(stock_quantity(self.item.name, "Stores"), 6)

	def test_serial_number_cannot_repeat_in_a_row(self):
		item = self._serial_item()
		receipt = frappe.get_doc(
			movement_values(
				"Material Receipt",
				[
					{
						"item_code": item,
						"t_warehouse": "Stores",
						"qty": 2,
						"basic_rate": 5,
						"serial_no": "S1\nS1",
					}
				],
			)
		)

		self.assertRaisesRegex(frappe.ValidationError, "more than once", receipt.insert)

	def test_serial_numbers_must_match_the_quantity(self):
		item = self._serial_item()
		row = {"item_code": item, "s_warehouse": "Stores", "qty": 2, "basic_rate": 5, "serial_no": "S1"}
		issue = frappe.get_doc(movement_values("Material Issue", [row]))

		message = f"Need 2 Serial Numbers for Item {item}. You have provided 1"
		self.assertRaisesRegex(frappe.ValidationError, re.escape(message), issue.insert)

	def test_serial_number_cannot_repeat_across_rows(self):
		item = self._serial_item()
		row = {"item_code": item, "t_warehouse": "Stores", "qty": 1, "basic_rate": 5, "serial_no": "S1"}
		receipt = frappe.get_doc(movement_values("Material Receipt", [row, row]))

		self.assertRaisesRegex(frappe.ValidationError, "more than once", receipt.insert)

	def test_receipt_cannot_be_cancelled_once_its_stock_is_used(self):
		receipt = self._receive(10)
		make_movement(
			"Material Issue",
			[{"item_code": self.item.name, "s_warehouse": "Stores", "qty": 8, "basic_rate": 10}],
		).submit()

		self.assertRaisesRegex(frappe.ValidationError, "Insufficient stock", receipt.cancel)
		self.assertEqual(stock_quantity(self.item.name, "Stores"), 2)

	def test_receipt_cannot_be_cancelled_once_its_serial_number_left(self):
		item = self._serial_item()
		sold, kept = unique_name("SER"), unique_name("SER")
		receipt = self._receive_serial(item, sold)
		self._receive_serial(item, kept)
		make_movement(
			"Material Issue",
			[{"item_code": item, "s_warehouse": "Stores", "qty": 1, "basic_rate": 5, "serial_no": sold}],
		).submit()

		self.assertRaisesRegex(frappe.ValidationError, "not available", receipt.cancel)

	def test_batch_is_rejected_for_an_item_without_batches(self):
		batch = frappe.get_doc(
			{"doctype": "Books Batch", "batch_id": unique_name("BATCH"), "item": self.item.name}
		).insert()
		receipt = frappe.get_doc(
			movement_values(
				"Material Receipt",
				[
					{
						"item_code": self.item.name,
						"t_warehouse": "Stores",
						"qty": 1,
						"basic_rate": 5,
						"batch_no": batch.name,
					}
				],
			)
		)

		self.assertRaisesRegex(frappe.ValidationError, "does not use batches", receipt.insert)

	def test_serial_numbers_are_rejected_for_an_item_without_them(self):
		row = {"item_code": self.item.name, "t_warehouse": "Stores", "qty": 2, "basic_rate": 5}
		receipt = frappe.get_doc(movement_values("Material Receipt", [{**row, "serial_no": "S1"}]))

		self.assertRaisesRegex(frappe.ValidationError, "does not use serial numbers", receipt.insert)

	def test_serial_number_of_another_item_is_rejected(self):
		serial_number = unique_name("SER")
		self._receive_serial(self._serial_item(), serial_number)
		row = {"item_code": self._serial_item(), "t_warehouse": "Stores", "qty": 1, "basic_rate": 5}
		receipt = frappe.get_doc(movement_values("Material Receipt", [{**row, "serial_no": serial_number}]))

		self.assertRaisesRegex(frappe.ValidationError, "belongs to another item", receipt.insert)

	def test_serial_number_in_stock_cannot_be_received_again(self):
		item, serial_number = self._serial_item(), unique_name("SER")
		self._receive_serial(item, serial_number)

		self.assertRaisesRegex(
			frappe.ValidationError, "already in stock", self._receive_serial, item, serial_number
		)

	def test_issued_serial_number_is_consumed_until_the_issue_is_cancelled(self):
		item, serial_number = self._serial_item(), unique_name("SER")
		self._receive_serial(item, serial_number)
		row = {
			"item_code": item,
			"s_warehouse": "Stores",
			"qty": 1,
			"basic_rate": 5,
			"serial_no": serial_number,
		}
		issue = make_movement("Material Issue", [row])
		issue.submit()
		self.assertEqual(frappe.db.get_value("Books Serial No", serial_number, "status"), "Consumed")

		issue.cancel()
		self.assertEqual(frappe.db.get_value("Books Serial No", serial_number, "status"), "Active")

	def _receive_serial(self, item, serial_number):
		receipt = make_movement(
			"Material Receipt",
			[
				{
					"item_code": item,
					"t_warehouse": "Stores",
					"qty": 1,
					"basic_rate": 5,
					"serial_no": serial_number,
				}
			],
		)
		receipt.submit()
		return receipt

	def _receive(self, quantity):
		receipt = make_movement(
			"Material Receipt",
			[{"item_code": self.item.name, "t_warehouse": "Stores", "qty": quantity, "basic_rate": 10}],
		)
		receipt.submit()
		return receipt

	def _serial_item(self):
		return make_item(
			self.item.item_defaults[0].income_account,
			self.item.item_defaults[0].expense_account,
			is_stock_item=1,
			has_serial_no=1,
		).name

	def test_batch_and_serial_numbers_follow_stock(self):
		tracked_item = make_item(
			self.item.item_defaults[0].income_account,
			self.item.item_defaults[0].expense_account,
			is_stock_item=1,
			has_batch_no=1,
			has_serial_no=1,
		)
		batch = unique_name("BATCH")
		frappe.get_doc({"doctype": "Books Batch", "batch_id": batch, "item": tracked_item.name}).insert()
		serials = f"{unique_name('SER')}\n{unique_name('SER')}"
		receipt = make_movement(
			"Material Receipt",
			[
				{
					"item_code": tracked_item.name,
					"t_warehouse": "Stores",
					"qty": 2,
					"basic_rate": 12,
					"batch_no": batch,
					"serial_no": serials,
				}
			],
		)
		receipt.submit()

		self.assertEqual(frappe.db.get_value("Books Batch", batch, "item"), tracked_item.name)
		for serial_number in serials.splitlines():
			self.assertEqual(frappe.db.get_value("Books Serial No", serial_number, "status"), "Active")

	def test_receipt_requires_an_existing_batch(self):
		tracked_item = make_item(
			self.item.item_defaults[0].income_account,
			self.item.item_defaults[0].expense_account,
			is_stock_item=1,
			has_batch_no=1,
		)
		receipt = frappe.get_doc(
			movement_values(
				"Material Receipt",
				[
					{
						"item_code": tracked_item.name,
						"t_warehouse": "Stores",
						"qty": 2,
						"basic_rate": 12,
						"batch_no": unique_name("NEW-BATCH"),
					}
				],
			)
		)

		self.assertRaises(frappe.LinkValidationError, receipt.insert)

	def test_a_save_returns_the_batch_the_server_named(self):
		prefix = f"B{frappe.generate_hash(length=6)}-"
		item = make_item(
			self.item.item_defaults[0].income_account,
			self.item.item_defaults[0].expense_account,
			is_stock_item=1,
			has_batch_no=1,
			batch_number_series=prefix,
		).name
		row = {"item_code": item, "t_warehouse": "Stores", "qty": 2, "basic_rate": 12}

		movement = frappe.get_doc(movement_values("Material Receipt", [row])).insert()

		self.assertEqual(movement.items[0].batch_no, f"{prefix}1001")

	def test_untracked_item_cannot_move_stock(self):
		expense = make_account("Service Expense", root_type="Expense")
		item = make_item(self.item.item_defaults[0].income_account, expense.name).name
		receipt = frappe.get_doc(
			movement_values(
				"Material Receipt", [{"item_code": item, "t_warehouse": "Stores", "qty": 1, "basic_rate": 10}]
			)
		)

		self.assertRaisesRegex(frappe.ValidationError, "does not track stock", receipt.insert)

	def test_rows_default_to_the_inventory_location(self):
		set_company_value("default_warehouse", self.warehouse.name)
		row = {"item_code": self.item.name, "qty": 1, "basic_rate": 10}
		receipt = make_movement("Material Receipt", [row])
		issue = make_movement("Material Issue", [row])

		self.assertEqual(receipt.items[0].t_warehouse, self.warehouse.name)
		self.assertEqual(issue.items[0].s_warehouse, self.warehouse.name)

	def test_issues_and_receipts_keep_only_the_warehouse_they_use(self):
		set_company_value("default_warehouse", self.warehouse.name)
		row = {"item_code": self.item.name, "s_warehouse": "Stores", "t_warehouse": "Stores", "qty": 1}
		receipt = make_movement("Material Receipt", [row])
		issue = frappe.get_doc(movement_values("Material Issue", [{**row, "s_warehouse": None}]))
		issue.calculate()

		self.assertEqual((receipt.items[0].s_warehouse, receipt.items[0].t_warehouse), (None, "Stores"))
		self.assertEqual(
			(issue.items[0].s_warehouse, issue.items[0].t_warehouse), (self.warehouse.name, None)
		)

	def test_preview_fills_what_a_save_would_without_saving(self):
		set_company_value("default_warehouse", self.warehouse.name)
		self.item.db_set("standard_rate", 15)
		movement = frappe.get_doc(
			movement_values("Material Receipt", [{"item_code": self.item.name, "qty": 2}])
		)

		movement.preview()

		row = movement.items[0]
		self.assertEqual(movement.naming_series, default_series("Books Stock Entry"))
		self.assertEqual(
			(row.t_warehouse, row.basic_rate, row.amount, row.stock_uom),
			(self.warehouse.name, 15, 30, "Unit"),
		)
		self.assertEqual(movement.total_amount, 30)
		self.assertIsNone(movement.name)

	def test_preview_needs_the_right_to_make_movements(self):
		movement = frappe.get_doc(movement_values("Material Receipt", []))
		with self.set_user(ensure_user(READ_ONLY_USER)), self.assertRaises(frappe.PermissionError):
			movement.preview()

	def test_receipt_names_missing_serial_numbers_from_the_item_series(self):
		prefix = f"S{frappe.generate_hash(length=6)}-"
		item = make_item(
			self.item.item_defaults[0].income_account,
			self.item.item_defaults[0].expense_account,
			is_stock_item=1,
			has_serial_no=1,
			serial_no_series=prefix,
		).name

		receipt = make_movement("Material Receipt", [{"item_code": item, "t_warehouse": "Stores", "qty": 2}])

		self.assertEqual(receipt.items[0].serial_no.splitlines(), [f"{prefix}1001", f"{prefix}1002"])

	def test_repack_row_cannot_both_consume_and_produce(self):
		row = {"item_code": self.item.name, "qty": 1, "basic_rate": 10}
		repack = frappe.get_doc(
			movement_values(
				"Repack",
				[
					{**row, "s_warehouse": "Stores"},
					{**row, "s_warehouse": "Stores", "t_warehouse": self.warehouse.name},
				],
			)
		)

		self.assertRaisesRegex(frappe.ValidationError, "either a source or a target", repack.insert)


class IntegrationTestStockEntryPostings(IntegrationTestCase):
	"""A movement moves its net stock value between Stock In Hand and Stock Adjustment."""

	def setUp(self):
		income = make_account("Income", root_type="Income")
		received = make_account("Received", root_type="Liability")
		self.item = make_item(income.name, received.name, is_stock_item=1).name
		self.product = make_item(income.name, received.name, is_stock_item=1).name
		self.stock = make_account("Stock", account_type="Stock").name
		self.adjustment = make_account(
			"Adjustment", root_type="Expense", account_type="Stock Adjustment"
		).name
		set_company_value(
			{"default_inventory_account": self.stock, "stock_adjustment_account": self.adjustment}
		)
		self.shop = make_warehouse("Shop").name

	def test_each_purpose_posts_its_net_stock_value(self):
		receipt = self.submit("Material Receipt", [self.row(4, 10, t_warehouse="Stores")])
		issue = self.submit("Material Issue", [self.row(1, 99, s_warehouse="Stores")])
		transfer = self.submit(
			"Material Transfer", [self.row(1, 99, s_warehouse="Stores", t_warehouse=self.shop)]
		)
		consumed = self.row(2, 99, s_warehouse="Stores")
		repack = self.submit(
			"Repack", [consumed, {**self.row(1, 30, t_warehouse="Stores"), "item_code": self.product}]
		)

		self.assertEqual(self.balances(receipt), {self.stock: Decimal(40), self.adjustment: Decimal(-40)})
		self.assertEqual(self.balances(issue), {self.stock: Decimal(-10), self.adjustment: Decimal(10)})
		self.assertEqual(ledger_entries(transfer.doctype, transfer.name), [])
		self.assertEqual(self.balances(repack), {self.stock: Decimal(10), self.adjustment: Decimal(-10)})

	def test_cancelling_a_movement_reverses_its_entries(self):
		receipt = self.submit("Material Receipt", [self.row(4, 10, t_warehouse="Stores")])

		receipt.cancel()

		self.assertEqual(self.balances(receipt), {self.stock: Decimal(0), self.adjustment: Decimal(0)})
		self.assertTrue(all(entry.is_cancelled for entry in ledger_entries(receipt.doctype, receipt.name)))

	def test_a_restated_movement_posts_its_new_value(self):
		now = now_datetime()
		self.submit("Material Receipt", [self.row(5, 10, t_warehouse="Stores")], add_to_date(now, hours=-2))
		issue = self.submit(
			"Material Issue", [self.row(3, 10, s_warehouse="Stores")], add_to_date(now, hours=-1)
		)

		self.submit("Material Receipt", [self.row(2, 20, t_warehouse="Stores")], add_to_date(now, hours=-3))

		self.assertEqual(self.balances(issue), {self.stock: Decimal(-50), self.adjustment: Decimal(50)})

	def test_a_restated_transfer_passes_its_new_cost_on(self):
		now = now_datetime()
		warehouse = make_warehouse("Warehouse")
		self.submit("Material Receipt", [self.row(5, 10, t_warehouse="Stores")], add_to_date(now, hours=-4))
		first = self.submit(
			"Material Transfer",
			[self.row(3, 99, s_warehouse="Stores", t_warehouse=self.shop)],
			add_to_date(now, hours=-3),
		)
		second = self.submit(
			"Material Transfer",
			[self.row(3, 99, s_warehouse=self.shop, t_warehouse=warehouse.name)],
			add_to_date(now, hours=-2),
		)
		issue = self.submit(
			"Material Issue", [self.row(3, 99, s_warehouse=warehouse.name)], add_to_date(now, hours=-1)
		)

		self.submit("Material Receipt", [self.row(2, 20, t_warehouse="Stores")], add_to_date(now, hours=-5))

		self.assertEqual(ledger_entries(first.doctype, first.name), [])
		self.assertEqual(ledger_entries(second.doctype, second.name), [])
		self.assertEqual(self.balances(issue), {self.stock: Decimal(-50), self.adjustment: Decimal(50)})

	def row(self, quantity, rate, **warehouses):
		return {"item_code": self.item, "qty": quantity, "basic_rate": rate, **warehouses}

	def submit(self, purpose, items, date=None):
		movement = frappe.get_doc(
			{**movement_values(purpose, items), **posting_values(date or now_datetime())}
		)
		movement.insert().submit()
		return movement

	def balances(self, movement):
		balances = {}
		for entry in ledger_entries(movement.doctype, movement.name):
			balance = balances.get(entry.account, Decimal(0))
			balances[entry.account] = balance + Decimal(str(entry.debit)) - Decimal(str(entry.credit))
		return balances


def make_movement(purpose, items):
	return frappe.get_doc(movement_values(purpose, items)).insert()


def movement_values(purpose, items):
	return {"doctype": "Books Stock Entry", "purpose": purpose, "items": items}
