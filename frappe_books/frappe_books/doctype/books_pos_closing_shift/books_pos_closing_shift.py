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


class BooksPosClosingShift(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_closing_amounts.books_closing_amounts import (
			BooksClosingAmounts,
		)
		from frappe_books.frappe_books.doctype.books_closing_cash.books_closing_cash import (
			BooksClosingCash,
		)

		amended_from: DF.Link | None
		closing_amounts: DF.Table[BooksClosingAmounts]
		closing_cash: DF.Table[BooksClosingCash]
		closing_date: DF.Datetime | None
		journal_entry: DF.Link | None
		opening_shift: DF.Link | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Pos Closing Shift"

	def validate(self):
		self.set_opening_shift()
		validate_cash_rows(self.closing_cash)
		self.set_closing_amounts()
		cash_rows = self.get_cash_rows()
		if cash_rows and cash_total(self.closing_cash) != _cash_sum(cash_rows, "closing_amount"):
			frappe.throw(_("Closing Cash amount must equal the denomination total."))

	def before_submit(self):
		lock_pos_settings()
		if open_shift_name() != self.opening_shift:
			frappe.throw(_("POS shift {0} is not open.").format(self.opening_shift))
		self.set_closing_amounts()

	def on_submit(self):
		cash_rows = self.get_cash_rows()
		if not cash_rows:
			return
		journal = make_cash_journal(
			self.closing_date,
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
		self.set_opening_shift()
		self.set_closing_amounts()
		self.split_counted_cash()

	def set_opening_shift(self):
		if not self.opening_shift:
			self.opening_shift = open_shift_name()
		if not self.opening_shift:
			frappe.throw(_("There is no open POS shift to close."))

	def set_closing_amounts(self):
		"""Close the shift now: a row per opening amount, expecting it plus the shift's POS payments.

		A method's row keeps its counted amount and its name, so a preview updates the rows it was sent.
		"""
		self.closing_date = now_datetime()
		opening = frappe.get_doc("Books Pos Opening Shift", self.opening_shift)
		transactions = transacted_amounts(opening.opening_date, self.closing_date)
		counted = {row.payment_method: row for row in self.closing_amounts}
		rows = []
		for row in opening.opening_amounts:
			closing_row = counted.get(row.payment_method) or frappe._dict(payment_method=row.payment_method)
			closing = rounded(closing_row.closing_amount)
			if closing < 0:
				frappe.throw(_("Closing {0} Amount can not be negative.").format(row.payment_method))
			expected = rounded(as_decimal(row.amount) + as_decimal(transactions.get(row.payment_method)))
			closing_row.update(
				{
					"idx": len(rows) + 1,
					"opening_amount": rounded(row.amount),
					"closing_amount": closing,
					"expected_amount": expected,
					"difference_amount": closing - expected,
				}
			)
			rows.append(closing_row)
		self.set("closing_amounts", rows)

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
			row.difference_amount = row.closing_amount - rounded(row.expected_amount)

	def get_cash_rows(self):
		return [row for row in self.closing_amounts if is_cash_method(row.payment_method)]


def _cash_sum(cash_rows, fieldname):
	return rounded(sum_decimal(row.get(fieldname) for row in cash_rows))


def _closing_journal_rows(cash_rows):
	"""Move counted cash out of the counter, clear what was expected, and write off the difference."""
	settings = frappe.get_single("Books Pos Settings")
	rows = [
		(cash_account(), _cash_sum(cash_rows, "closing_amount"), 0),
		(settings.cash_account, 0, _cash_sum(cash_rows, "expected_amount")),
	]
	difference = _cash_sum(cash_rows, "difference_amount")
	if difference:
		if not settings.write_off_account:
			frappe.throw(_("POS Write Off Account is not set. Please set it on POS Settings"))
		rows.append((settings.write_off_account, max(-difference, 0), max(difference, 0)))
	return rows
