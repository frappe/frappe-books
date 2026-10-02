"""FIFO valuation of the stock ledger."""

import json
from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, now_datetime

from frappe_books.frappe_books.doctype.books_stock_movement.test_books_stock_movement import (
	movement_values,
)
from frappe_books.reports.stock import get_ledger_data
from frappe_books.tests.accounting import make_account, make_item, unique_name


class IntegrationTestValuation(IntegrationTestCase):
	def setUp(self):
		income = make_account("Valuation Income", root_type="Income")
		received = make_account("Valuation Received", root_type="Liability")
		# Kilograms, as the rounding test moves fractions and a Unit is whole.
		self.item = make_item(income.name, received.name, track_item=1, unit="Kg").name

	def test_fifo_balances_follow_receipts_and_issues(self):
		move(self.item, "MaterialReceipt", 5, 10)
		move(self.item, "MaterialIssue", 2, 10)

		entries = get_ledger_data({"item": self.item, "ascending": True})

		self.assertEqual(len(entries), 2)
		self.assertEqual(entries[-1]["balance_quantity"], 3)
		self.assertEqual(entries[-1]["balance_value"], Decimal("30.00"))
		self.assertEqual(entries[-1]["valuation_rate"], Decimal("10.00"))

	def test_issue_consumes_oldest_layers_first(self):
		move(self.item, "MaterialReceipt", 4, 10)
		move(self.item, "MaterialReceipt", 2, 20)
		issue = move(self.item, "MaterialIssue", 5, 99)

		entry = ledger_entry(issue)
		self.assertEqual(Decimal(str(entry.value_change)), Decimal("-60"))
		self.assertEqual(entry.balance_quantity, 1)
		self.assertEqual(Decimal(str(entry.balance_value)), Decimal("20"))
		self.assertEqual(json.loads(entry.stock_queue), [["1", "20"]])

	def test_transfer_moves_stock_at_the_cost_it_leaves_with(self):
		shop = frappe.get_doc({"doctype": "Books Location", "name": unique_name("Shop")}).insert().name
		move(self.item, "MaterialReceipt", 2, 10)
		move(self.item, "MaterialReceipt", 1, 20)
		row = {"item": self.item, "from_location": "Stores", "to_location": shop, "quantity": 3, "rate": 99}
		transfer = frappe.get_doc(movement_values("MaterialTransfer", [row])).insert()
		transfer.submit()

		values = frappe.get_all(
			"Books Stock Ledger Entry",
			filters={"reference_name": transfer.name},
			fields=["location", "value_change"],
		)
		self.assertEqual(
			{entry.location: Decimal(str(entry.value_change)) for entry in values},
			{"Stores": Decimal("-40"), shop: Decimal("40")},
		)

	def test_emptying_stock_clears_rounding_remainder(self):
		move(self.item, "MaterialReceipt", 0.5, 0.01)
		move(self.item, "MaterialIssue", 0.25, 0.01)
		issue = move(self.item, "MaterialIssue", 0.25, 0.01)

		entry = ledger_entry(issue)
		self.assertEqual(entry.balance_quantity, 0)
		self.assertEqual(Decimal(str(entry.balance_value)), Decimal("0"))

	def test_backdated_receipt_restates_later_issue(self):
		now = now_datetime()
		move(self.item, "MaterialReceipt", 5, 10, add_to_date(now, hours=-2))
		issue = move(self.item, "MaterialIssue", 3, 10, add_to_date(now, hours=-1))

		move(self.item, "MaterialReceipt", 2, 20, add_to_date(now, hours=-3))

		entry = ledger_entry(issue)
		self.assertEqual(Decimal(str(entry.value_change)), Decimal("-50"))
		self.assertEqual(entry.balance_quantity, 4)
		self.assertEqual(Decimal(str(entry.balance_value)), Decimal("40"))

	def test_cancelled_receipt_restates_later_issue(self):
		now = now_datetime()
		receipt = move(self.item, "MaterialReceipt", 2, 20, add_to_date(now, hours=-3))
		move(self.item, "MaterialReceipt", 5, 10, add_to_date(now, hours=-2))
		issue = move(self.item, "MaterialIssue", 3, 10, add_to_date(now, hours=-1))

		receipt.cancel()

		entry = ledger_entry(issue)
		self.assertEqual(Decimal(str(entry.value_change)), Decimal("-30"))
		self.assertEqual(entry.balance_quantity, 2)
		self.assertEqual(Decimal(str(entry.balance_value)), Decimal("20"))

	def test_backdated_issue_needs_stock_at_its_date_and_after(self):
		now = now_datetime()
		move(self.item, "MaterialReceipt", 5, 10, add_to_date(now, hours=-3))
		move(self.item, "MaterialIssue", 5, 10, add_to_date(now, hours=-1))
		move(self.item, "MaterialReceipt", 5, 10, now)

		for hours in (-4, -2):
			with self.subTest(hours=hours):
				self.assertRaisesRegex(
					frappe.ValidationError,
					"Insufficient stock",
					move,
					self.item,
					"MaterialIssue",
					2,
					10,
					add_to_date(now, hours=hours),
				)
		move(self.item, "MaterialIssue", 5, 10, add_to_date(now, hours=1))

	def test_receipt_used_by_a_later_issue_cannot_be_cancelled(self):
		now = now_datetime()
		receipt = move(self.item, "MaterialReceipt", 5, 10, add_to_date(now, hours=-3))
		move(self.item, "MaterialIssue", 5, 10, add_to_date(now, hours=-2))
		move(self.item, "MaterialReceipt", 5, 10, add_to_date(now, hours=-1))

		self.assertRaisesRegex(frappe.ValidationError, "Insufficient stock", receipt.cancel)


def move(item, movement_type, quantity, rate, date=None):
	location = "to_location" if movement_type == "MaterialReceipt" else "from_location"
	values = movement_values(
		movement_type, [{"item": item, location: "Stores", "quantity": quantity, "rate": rate}]
	)
	movement = frappe.get_doc({**values, "date": date or now_datetime()}).insert()
	movement.submit()
	return movement


def ledger_entry(movement):
	return frappe.get_last_doc(
		"Books Stock Ledger Entry",
		filters={"reference_type": movement.doctype, "reference_name": movement.name},
	)
