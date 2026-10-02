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
from frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice import pay_pos_invoice
from frappe_books.tests.accounting import (
	ledger_entries,
	make_account,
	make_invoice,
	make_item,
	make_party,
	unique_name,
)


class IntegrationTestBooksPosClosingShift(IntegrationTestCase):
	def setUp(self):
		self.counter = set_pos_accounts()
		self.write_off = frappe.db.get_single_value("Books Pos Settings", "write_off_account")
		self.receivable = make_account("POS Receivable", account_type="Receivable")
		self.party = make_party(self.receivable.name)

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

	def test_a_counter_that_is_the_cash_account_posts_only_the_difference(self):
		frappe.db.set_single_value("Books Pos Settings", "cash_account", "Cash")
		opening = open_shift(100)
		self.assertIsNone(opening.journal_entry)

		closing = close_shift(opening, 90)

		entries = ledger_entries("Books Journal Entry", closing.journal_entry)
		self.assertEqual((debits(entries, "Cash"), credits(entries, "Cash")), (0, Decimal("10")))
		self.assertEqual(debits(entries, self.write_off), Decimal("10"))

	def test_closing_counts_sales_made_after_its_draft_was_saved(self):
		draft = make_closing_shift(open_shift(100), 280).insert()
		invoice = self._pos_invoice()
		self._cash_payment([invoice]).submit()

		draft.submit()

		self.assertEqual(invoice.base_grand_total, 180)
		self.assertEqual(cash_amounts(draft).expected_amount, 280)
		self.assertEqual(cash_amounts(draft).difference_amount, 0)

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

	def test_preview_fills_the_open_shift_amounts_without_saving(self):
		opening = open_shift(100)
		invoice = self._pos_invoice()
		self._cash_payment([invoice]).submit()
		draft = frappe.get_doc({"doctype": "Books Pos Closing Shift"})

		draft.preview()

		self.assertIsNone(draft.name)
		self.assertEqual(draft.opening_shift, opening.name)
		cash_row = cash_amounts(draft)
		self.assertEqual(cash_row.opening_amount, 100)
		self.assertEqual(cash_row.expected_amount, 100 + invoice.base_grand_total)
		self.assertEqual(cash_row.difference_amount, -cash_row.expected_amount)

	def test_preview_keeps_the_counted_rows_it_was_sent(self):
		open_shift(100)
		draft = frappe.get_doc(
			{
				"doctype": "Books Pos Closing Shift",
				"closing_cash": [{"denomination": 90, "count": 1}],
				"closing_amounts": [
					{"name": "counted-bank", "payment_method": "Bank", "closing_amount": 5},
					{"name": "counted-cash", "payment_method": "Cash", "closing_amount": 0},
				],
			}
		)

		draft.preview()

		rows = [(row.name, row.idx, row.payment_method) for row in draft.closing_amounts]
		self.assertEqual(rows, [("counted-cash", 1, "Cash"), ("counted-bank", 2, "Bank")])
		self.assertEqual(cash_amounts(draft).difference_amount, -10)
		self.assertEqual(draft.closing_amounts[1].difference_amount, 5)

	def test_preview_shares_the_counted_cash_among_the_cash_methods(self):
		petty = frappe.get_doc(
			{"doctype": "Books Payment Method", "name": unique_name("Petty Cash"), "type": "Cash"}
		).insert()
		opening = frappe.get_doc(
			{
				"doctype": "Books Pos Opening Shift",
				"opening_cash": [{"denomination": 100, "count": 1}],
				"opening_amounts": [
					{"payment_method": "Cash", "amount": 60},
					{"payment_method": petty.name, "amount": 40},
				],
			}
		).insert()
		opening.submit()

		shares = []
		for counted in (130, 50):
			draft = frappe.get_doc(
				{
					"doctype": "Books Pos Closing Shift",
					"closing_cash": [{"denomination": counted, "count": 1}],
				}
			)
			draft.preview()
			shares.append([(row.closing_amount, row.difference_amount) for row in draft.closing_amounts])

		# Each takes up to what it expects; the first also takes the surplus.
		self.assertEqual(shares, [[(90, 30), (40, 0)], [(50, -10), (0, -40)]])

	def test_preview_needs_an_open_shift(self):
		draft = frappe.get_doc({"doctype": "Books Pos Closing Shift"})

		self.assertRaisesRegex(frappe.ValidationError, "no open POS shift", draft.preview)

	def test_payment_for_several_invoices_is_counted_once(self):
		open_shift(0)
		start = now_datetime()
		invoices = [self._pos_invoice(), self._pos_invoice()]
		self._cash_payment(invoices).submit()

		amounts = transacted_amounts(start, add_days(now_datetime(), 1))

		self.assertEqual(amounts["Cash"], sum(invoice.base_grand_total for invoice in invoices))

	def test_a_cash_difference_needs_the_write_off_account(self):
		opening = open_shift(100)
		frappe.db.set_single_value("Books Pos Settings", "write_off_account", None)

		message = "POS Write Off Account is not set. Please set it on POS Settings"
		self.assertRaisesRegex(frappe.ValidationError, message, close_shift, opening, 90)

	def test_a_closing_amount_cannot_be_negative(self):
		closing = make_closing_shift(open_shift(100), 100)
		closing.closing_amounts[1].closing_amount = -5

		self.assertRaisesRegex(
			frappe.ValidationError, "Closing Bank Amount can not be negative.", closing.insert
		)

	def test_every_cash_type_method_is_reconciled_through_the_counter(self):
		petty = frappe.get_doc(
			{"doctype": "Books Payment Method", "name": unique_name("Petty Cash"), "type": "Cash"}
		).insert()
		opening = frappe.get_doc(
			{
				"doctype": "Books Pos Opening Shift",
				"opening_cash": [{"denomination": 100, "count": 1}],
				"opening_amounts": [
					{"payment_method": "Cash", "amount": 60},
					{"payment_method": petty.name, "amount": 40},
				],
			}
		).insert()
		opening.submit()
		invoice = self._pos_invoice()
		pay_pos_invoice(invoice.name, [{"payment_method": petty.name, "amount": invoice.base_grand_total}])

		closing = make_closing_shift(opening, 280)
		closing.closing_amounts[0].closing_amount = 60
		closing.append("closing_amounts", {"payment_method": petty.name, "closing_amount": 220})
		closing.insert().submit()

		self.assertEqual([row.difference_amount for row in closing.closing_amounts], [0, 0])
		entries = frappe.get_all(
			"Books Ledger Entry", filters={"account": self.counter}, fields=["debit", "credit"]
		)
		self.assertEqual(sum(row.debit - row.credit for row in entries), 0)

	def _pos_invoice(self):
		income = make_account("POS Income", root_type="Income", account_type="Income Account")
		expense = make_account("POS Expense", root_type="Expense", account_type="Expense Account")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		item = make_item(income.name, expense.name)
		invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, item.name, income.name, is_pos=1
		)
		invoice.submit()
		return invoice

	def _cash_payment(self, invoices):
		return frappe.get_doc(
			{
				"doctype": "Books Payment",
				"party": self.party.name,
				"date": now_datetime(),
				"payment_type": "Receive",
				"account": self.receivable.name,
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
	shift = make_closing_shift(opening, counted_cash).insert()
	shift.submit()
	return shift


def make_closing_shift(opening, counted_cash):
	return frappe.get_doc(
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
	)


def cash_amounts(shift):
	return next(row for row in shift.closing_amounts if row.payment_method == "Cash")
