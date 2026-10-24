# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

from frappe_books.accounting.money import as_decimal, rounded, sum_decimal
from frappe_books.commerce.pos import (
	cancel_cash_journal,
	cash_account,
	cash_total,
	is_cash_method,
	lock_pos_settings,
	make_cash_journal,
	open_shift_name,
	transacted_amounts,
	validate_cash_rows,
)
from frappe_books.permissions import check_preview_permission


class BooksPOSClosingEntry(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_closing_cash.books_closing_cash import BooksClosingCash
		from frappe_books.frappe_books.doctype.books_pos_closing_entry_detail.books_pos_closing_entry_detail import (
			BooksPOSClosingEntryDetail,
		)

		amended_from: DF.Link | None
		closing_cash: DF.Table[BooksClosingCash]
		company: DF.Link | None
		journal_entry: DF.Link | None
		payment_reconciliation: DF.Table[BooksPOSClosingEntryDetail]
		period_end_date: DF.Datetime
		pos_opening_entry: DF.Link
	# end: auto-generated types

	_DOCTYPE_NAME = "Books POS Closing Entry"

	def validate(self):
		self.set_pos_opening_entry()
		validate_cash_rows(self.closing_cash)
		self.set_closing_amounts()
		cash_rows = self.get_cash_rows()
		if cash_rows and cash_total(self.closing_cash) != _cash_sum(cash_rows, "closing_amount"):
			frappe.throw(_("Closing Cash amount must equal the denomination total."))

	def before_submit(self):
		lock_pos_settings()
		if open_shift_name() != self.pos_opening_entry:
			frappe.throw(_("POS shift {0} is not open.").format(self.pos_opening_entry))
		self.set_closing_amounts()

	def on_submit(self):
		cash_rows = self.get_cash_rows()
		if not cash_rows:
			return
		journal = make_cash_journal(
			self.period_end_date,
			_closing_journal_rows(cash_rows),
			_("POS closing shift {0}").format(self.name),
		)
		self.db_set("journal_entry", journal)

	def before_cancel(self):
		lock_pos_settings()
		if open_shift := open_shift_name():
			frappe.throw(_("Close POS shift {0} before reopening another shift.").format(open_shift))

	def on_cancel(self):
		cancel_cash_journal(self.journal_entry)

	@frappe.whitelist()
	def preview(self):
		"""Fill the closing amounts a save would store, with the counted cash as the cash methods' amounts, without saving."""
		check_preview_permission(self)
		self.set_pos_opening_entry()
		self.set_closing_amounts()
		self.split_counted_cash()

	def set_pos_opening_entry(self):
		if not self.pos_opening_entry:
			self.pos_opening_entry = open_shift_name()
		if not self.pos_opening_entry:
			frappe.throw(_("There is no open POS shift to close."))

	def set_closing_amounts(self):
		"""Close the shift now: a row per opening amount, expecting it plus the shift's POS payments.

		A method's row keeps its counted amount and its name, so a preview updates the rows it was sent.
		"""
		self.period_end_date = now_datetime()
		opening = frappe.get_doc("Books POS Opening Entry", self.pos_opening_entry)
		transactions = transacted_amounts(opening.period_start_date, self.period_end_date)
		counted = {row.mode_of_payment: row for row in self.payment_reconciliation}
		rows = []
		for row in opening.balance_details:
			closing_row = counted.get(row.mode_of_payment) or frappe._dict(
				mode_of_payment=row.mode_of_payment
			)
			closing = rounded(closing_row.closing_amount)
			if closing < 0:
				frappe.throw(_("Closing {0} Amount can not be negative.").format(row.mode_of_payment))
			expected = rounded(
				as_decimal(row.opening_amount) + as_decimal(transactions.get(row.mode_of_payment))
			)
			closing_row.update(
				{
					"idx": len(rows) + 1,
					"opening_amount": rounded(row.opening_amount),
					"closing_amount": closing,
					"expected_amount": expected,
					"difference": closing - expected,
				}
			)
			rows.append(closing_row)
		self.set("payment_reconciliation", rows)

	def split_counted_cash(self):
		"""Share the counted cash among the cash methods: each up to what it expects, the first also any surplus."""
		cash_rows = self.get_cash_rows()
		remaining = cash_total(self.closing_cash)
		for row in cash_rows:
			row.closing_amount = min(max(rounded(row.expected_amount), 0), remaining)
			remaining -= row.closing_amount
		if cash_rows:
			cash_rows[0].closing_amount += remaining
		for row in cash_rows:
			row.difference = row.closing_amount - rounded(row.expected_amount)

	def get_cash_rows(self):
		return [row for row in self.payment_reconciliation if is_cash_method(row.mode_of_payment)]


def _cash_sum(cash_rows, fieldname):
	return rounded(sum_decimal(row.get(fieldname) for row in cash_rows))


def _closing_journal_rows(cash_rows):
	"""Move counted cash out of the counter, clear what was expected, and write off the difference."""
	settings = frappe.get_single("Books POS Settings")
	rows = [
		(cash_account(), _cash_sum(cash_rows, "closing_amount"), 0),
		(settings.cash_account, 0, _cash_sum(cash_rows, "expected_amount")),
	]
	difference = _cash_sum(cash_rows, "difference")
	if difference:
		if not settings.write_off_account:
			frappe.throw(_("POS Write Off Account is not set. Please set it on POS Settings"))
		rows.append((settings.write_off_account, max(-difference, 0), max(difference, 0)))
	return rows
