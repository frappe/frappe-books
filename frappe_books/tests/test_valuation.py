"""FIFO valuation of the stock ledger."""

import json
from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase, UnitTestCase
from frappe.utils import add_to_date, get_datetime, getdate, now_datetime

from frappe_books.dates import posting_datetime
from frappe_books.frappe_books.doctype.books_stock_entry.test_books_stock_entry import (
	movement_values,
)
from frappe_books.inventory.valuation import next_state
from frappe_books.reports.stock import get_ledger_data
from frappe_books.tests.accounting import make_account, make_item, make_warehouse, posting_values

CENT = Decimal("0.01")


class UnitTestFifoState(UnitTestCase):
	def test_receipt_adds_a_layer_at_its_rate(self):
		state = next_state(None, 5, 10, CENT)

		self.assertEqual(state_values(state), (50, 5, 50, [["5", "10"]]))

	def test_issue_consumes_the_oldest_layers_first(self):
		state = next_state(fifo_state(6, 80, [["4", "10"], ["2", "20"]]), -5, 99, CENT)

		self.assertEqual(state_values(state), (-60, 1, 20, [["1", "20"]]))

	def test_issue_beyond_the_stock_is_valued_at_its_own_rate(self):
		state = next_state(fifo_state(2, 20, [["2", "10"]]), -3, 7, CENT)

		self.assertEqual(state_values(state), (-27, -1, -7, []))

	def test_emptying_stock_clears_the_rounding_remainder(self):
		state = next_state(fifo_state("0.25", "0.01", [["0.25", "0.01"]]), "-0.25", "0.01", CENT)

		self.assertEqual(state_values(state), (Decimal("-0.01"), 0, 0, []))

	def test_value_is_rounded_half_up_to_the_currency_unit(self):
		self.assertEqual(next_state(None, 3, "3.335", CENT)["stock_value_difference"], Decimal("10.01"))
		self.assertEqual(next_state(None, 3, "3.335", Decimal(1))["stock_value_difference"], Decimal(10))


class IntegrationTestValuation(IntegrationTestCase):
	def setUp(self):
		income = make_account("Valuation Income", root_type="Income")
		received = make_account("Valuation Received", root_type="Liability")
		self.item = make_item(income.name, received.name, is_stock_item=1).name

	def test_fifo_balances_follow_receipts_and_issues(self):
		move(self.item, "Material Receipt", 5, 10)
		move(self.item, "Material Issue", 2, 10)

		entries = get_ledger_data({"item_code": self.item, "ascending": True})

		self.assertEqual(len(entries), 2)
		self.assertEqual(entries[-1]["qty_after_transaction"], 3)
		self.assertEqual(entries[-1]["stock_value"], Decimal("30.00"))
		self.assertEqual(entries[-1]["valuation_rate"], Decimal("10.00"))

	def test_entry_takes_its_document_posting_date_and_time(self):
		posted = get_datetime("2060-05-04 10:11:12")
		receipt = move(self.item, "Material Receipt", 1, 10, posted)

		entry = ledger_entry(receipt)

		self.assertEqual(getdate(entry.posting_date), posted.date())
		self.assertEqual(posting_datetime(entry.posting_date, entry.posting_time), posted)
		self.assertEqual((get_datetime(entry.posting_datetime), entry.is_cancelled), (posted, 0))

	def test_transfer_moves_stock_at_the_cost_it_leaves_with(self):
		shop = make_warehouse("Shop").name
		move(self.item, "Material Receipt", 2, 10)
		move(self.item, "Material Receipt", 1, 20)
		row = {
			"item_code": self.item,
			"s_warehouse": "Stores",
			"t_warehouse": shop,
			"qty": 3,
			"basic_rate": 99,
		}
		transfer = frappe.get_doc(movement_values("Material Transfer", [row])).insert()
		transfer.submit()

		values = frappe.get_all(
			"Books Stock Ledger Entry",
			filters={"voucher_no": transfer.name},
			fields=["warehouse", "stock_value_difference"],
		)
		self.assertEqual(
			{entry.warehouse: Decimal(str(entry.stock_value_difference)) for entry in values},
			{"Stores": Decimal("-40"), shop: Decimal("40")},
		)

	def test_backdated_receipt_restates_later_issue(self):
		now = now_datetime()
		move(self.item, "Material Receipt", 5, 10, add_to_date(now, hours=-2))
		issue = move(self.item, "Material Issue", 3, 10, add_to_date(now, hours=-1))

		move(self.item, "Material Receipt", 2, 20, add_to_date(now, hours=-3))

		entry = ledger_entry(issue)
		self.assertEqual(Decimal(str(entry.stock_value_difference)), Decimal("-50"))
		self.assertEqual(entry.qty_after_transaction, 4)
		self.assertEqual(Decimal(str(entry.stock_value)), Decimal("40"))

	def test_cancelled_receipt_restates_later_issue(self):
		now = now_datetime()
		receipt = move(self.item, "Material Receipt", 2, 20, add_to_date(now, hours=-3))
		move(self.item, "Material Receipt", 5, 10, add_to_date(now, hours=-2))
		issue = move(self.item, "Material Issue", 3, 10, add_to_date(now, hours=-1))

		receipt.cancel()

		entry = ledger_entry(issue)
		self.assertEqual(Decimal(str(entry.stock_value_difference)), Decimal("-30"))
		self.assertEqual(entry.qty_after_transaction, 2)
		self.assertEqual(Decimal(str(entry.stock_value)), Decimal("20"))

	def test_backdated_issue_needs_stock_at_its_date_and_after(self):
		now = now_datetime()
		move(self.item, "Material Receipt", 5, 10, add_to_date(now, hours=-3))
		move(self.item, "Material Issue", 5, 10, add_to_date(now, hours=-1))
		move(self.item, "Material Receipt", 5, 10, now)

		for hours in (-4, -2):
			with self.subTest(hours=hours):
				self.assertRaisesRegex(
					frappe.ValidationError,
					"Insufficient stock",
					move,
					self.item,
					"Material Issue",
					2,
					10,
					add_to_date(now, hours=hours),
				)
		move(self.item, "Material Issue", 5, 10, add_to_date(now, hours=1))

	def test_receipt_used_by_a_later_issue_cannot_be_cancelled(self):
		now = now_datetime()
		receipt = move(self.item, "Material Receipt", 5, 10, add_to_date(now, hours=-3))
		move(self.item, "Material Issue", 5, 10, add_to_date(now, hours=-2))
		move(self.item, "Material Receipt", 5, 10, add_to_date(now, hours=-1))

		self.assertRaisesRegex(frappe.ValidationError, "Insufficient stock", receipt.cancel)


def move(item, purpose, quantity, rate, date=None):
	warehouse = "t_warehouse" if purpose == "Material Receipt" else "s_warehouse"
	values = movement_values(
		purpose, [{"item_code": item, warehouse: "Stores", "qty": quantity, "basic_rate": rate}]
	)
	movement = frappe.get_doc({**values, **posting_values(date or now_datetime())}).insert()
	movement.submit()
	return movement


def ledger_entry(movement):
	return frappe.get_last_doc(
		"Books Stock Ledger Entry",
		filters={"voucher_type": movement.doctype, "voucher_no": movement.name},
	)


def fifo_state(qty_after_transaction, stock_value, layers):
	return frappe._dict(
		qty_after_transaction=qty_after_transaction, stock_value=stock_value, stock_queue=json.dumps(layers)
	)


def state_values(state):
	return (
		state["stock_value_difference"],
		state["qty_after_transaction"],
		state["stock_value"],
		json.loads(state["stock_queue"]),
	)
