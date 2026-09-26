# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, now_datetime

from frappe_books.commerce.pos import open_shift_name, transacted_amounts
from frappe_books.frappe_books.doctype.books_pos_opening_shift.test_books_pos_opening_shift import (
	credits,
	debits,
	open_shift,
	set_pos_accounts,
)
from frappe_books.tests.accounting import ledger_entries, make_account, make_invoice, make_item, make_party
from frappe_books.ui_bridge.bespoke import BooksBespokeQueries


class IntegrationTestBooksPosClosingShift(IntegrationTestCase):
	def setUp(self):
		self.counter = set_pos_accounts()
		self.write_off = frappe.db.get_single_value("Books Pos Settings", "write_off_account")

	def test_closing_reconciles_cash_and_closes_shift(self):
		opening = open_shift(100)

		closing = close_shift(opening, 100)

		cash_row = cash_amounts(closing)
		self.assertEqual(cash_row.expected_amount, 100)
		self.assertEqual(cash_row.difference_amount, 0)
		self.assertIsNone(open_shift_name())
		entries = ledger_entries("Books Journal Entry", closing.journal_entry)
		self.assertEqual(debits(entries, "Cash"), Decimal("100"))
		self.assertEqual(credits(entries, self.counter), Decimal("100"))

	def test_cash_shortage_is_written_off_from_counter(self):
		closing = close_shift(open_shift(100), 90)

		entries = ledger_entries("Books Journal Entry", closing.journal_entry)
		self.assertEqual(debits(entries, "Cash"), Decimal("90"))
		self.assertEqual(debits(entries, self.write_off), Decimal("10"))
		self.assertEqual(credits(entries, self.counter), Decimal("100"))

	def test_cash_overage_is_written_back_from_counter(self):
		closing = close_shift(open_shift(100), 110)

		entries = ledger_entries("Books Journal Entry", closing.journal_entry)
		self.assertEqual(debits(entries, "Cash"), Decimal("110"))
		self.assertEqual(credits(entries, self.counter), Decimal("100"))
		self.assertEqual(credits(entries, self.write_off), Decimal("10"))

	def test_cash_found_without_expected_cash_is_posted(self):
		closing = close_shift(open_shift(0), 5)

		entries = ledger_entries("Books Journal Entry", closing.journal_entry)
		self.assertEqual(debits(entries, "Cash"), Decimal("5"))
		self.assertEqual(credits(entries, self.write_off), Decimal("5"))

	def test_shift_cannot_be_closed_twice(self):
		opening = open_shift(100)
		close_shift(opening, 100)

		with self.assertRaisesRegex(frappe.ValidationError, "is not open"):
			close_shift(opening, 100)

	def test_cancelled_closing_reopens_shift_and_reverses_cash(self):
		opening = open_shift(100)
		closing = close_shift(opening, 100)

		closing.cancel()

		self.assertEqual(open_shift_name(), opening.name)
		self.assertEqual(frappe.db.get_value("Books Journal Entry", closing.journal_entry, "docstatus"), 2)
		close_shift(opening, 100)
		self.assertIsNone(open_shift_name())

	def test_closing_cannot_reopen_shift_while_another_is_open(self):
		closing = close_shift(open_shift(0), 0)
		open_shift(0)

		self.assertRaisesRegex(frappe.ValidationError, "before reopening", closing.cancel)

	def test_opening_shift_with_closing_cannot_be_cancelled(self):
		opening = open_shift(0)
		close_shift(opening, 0)

		self.assertRaises(frappe.LinkExistsError, frappe.get_doc(opening.doctype, opening.name).cancel)

	def test_interface_expected_amounts_match_closing_shift_totals(self):
		receivable = make_account("POS Receivable", account_type="Receivable")
		income = make_account("POS Income", root_type="Income", account_type="Income Account")
		expense = make_account("POS Expense", root_type="Expense", account_type="Expense Account")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		start = now_datetime()
		invoice = make_invoice(
			"Books Sales Invoice", party.name, receivable.name, item.name, income.name, is_pos=1
		)
		invoice.submit()
		self._cash_payment(party, receivable, [invoice]).submit()
		end = add_days(now_datetime(), 1)

		amounts = BooksBespokeQueries().pos_transacted_amount(start.isoformat(), end.isoformat())

		self.assertEqual(amounts, transacted_amounts(start, end))
		self.assertEqual(amounts["Cash"], invoice.base_grand_total)

	def _cash_payment(self, party, account, invoices):
		return frappe.get_doc(
			{
				"doctype": "Books Payment",
				"party": party.name,
				"date": now_datetime(),
				"payment_type": "Receive",
				"account": account.name,
				"payment_account": self.counter,
				"payment_method": "Cash",
				"amount": sum(invoice.base_grand_total for invoice in invoices),
				"payment_references": [
					{
						"reference_type": invoice.doctype,
						"reference_name": invoice.name,
						"amount": invoice.base_grand_total,
					}
					for invoice in invoices
				],
			}
		).insert()


def close_shift(opening, counted_cash):
	shift = frappe.get_doc(
		{
			"doctype": "Books Pos Closing Shift",
			"opening_shift": opening.name,
			"closing_date": now_datetime(),
			"closing_cash": [{"denomination": counted_cash, "count": 1}] if counted_cash else [],
			"closing_amounts": [
				{"payment_method": "Cash", "closing_amount": counted_cash},
				{"payment_method": "Bank", "closing_amount": 0},
			],
		}
	).insert()
	shift.submit()
	return shift


def cash_amounts(shift):
	return next(row for row in shift.closing_amounts if row.payment_method == "Cash")
