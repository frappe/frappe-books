# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.commerce.pos import (
	cancel_cash_journal,
	cash_account,
	cash_total,
	lock_pos_settings,
	make_cash_journal,
	open_shift_name,
	transacted_amounts,
	validate_cash_rows,
)


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
		if not self.opening_shift:
			self.opening_shift = open_shift_name()
		if not self.opening_shift:
			frappe.throw(_("There is no open POS shift to close."))
		if not self.closing_date:
			self.closing_date = now_datetime()
		validate_cash_rows(self.closing_cash)
		self.set_closing_amounts()
		cash_row = self.get_cash_row()
		if cash_row and cash_total(self.closing_cash) != rounded(cash_row.closing_amount):
			frappe.throw(_("Closing Cash amount must equal the denomination total."))

	def before_submit(self):
		lock_pos_settings()
		if open_shift_name() != self.opening_shift:
			frappe.throw(_("POS shift {0} is not open.").format(self.opening_shift))

	def on_submit(self):
		cash_row = self.get_cash_row()
		if not cash_row:
			return
		journal = make_cash_journal(
			self.closing_date,
			_closing_journal_rows(cash_row),
			_("POS closing shift {0}").format(self.name),
		)
		self.db_set("journal_entry", journal)

	def before_cancel(self):
		lock_pos_settings()
		if open_shift := open_shift_name():
			frappe.throw(_("Close POS shift {0} before reopening another shift.").format(open_shift))

	def on_cancel(self):
		cancel_cash_journal(self.journal_entry)

	def set_closing_amounts(self):
		"""Rebuild closing rows from the opening amounts and the shift's POS payments."""
		opening = frappe.get_doc("Books Pos Opening Shift", self.opening_shift)
		transactions = transacted_amounts(opening.opening_date, self.closing_date)
		counted = {row.payment_method: row.closing_amount for row in self.closing_amounts}
		self.set("closing_amounts", [])
		for row in opening.opening_amounts:
			closing = rounded(counted.get(row.payment_method))
			if closing < 0:
				frappe.throw(_("Closing amounts cannot be negative."))
			expected = rounded(as_decimal(row.amount) + as_decimal(transactions.get(row.payment_method)))
			self.append(
				"closing_amounts",
				{
					"payment_method": row.payment_method,
					"opening_amount": rounded(row.amount),
					"closing_amount": closing,
					"expected_amount": expected,
					"difference_amount": closing - expected,
				},
			)

	def get_cash_row(self):
		return next((row for row in self.closing_amounts if row.payment_method == "Cash"), None)


def _closing_journal_rows(cash_row):
	if not as_decimal(cash_row.expected_amount):
		return []
	settings = frappe.get_single("Books Pos Settings")
	closing = rounded(cash_row.closing_amount)
	difference = rounded(cash_row.difference_amount)
	rows = [(cash_account(), closing, 0), (settings.cash_account, 0, closing)]
	if difference < 0:
		rows.extend([(cash_account(), abs(difference), 0), (settings.write_off_account, 0, abs(difference))])
	elif difference > 0:
		rows.extend([(settings.write_off_account, difference, 0), (cash_account(), 0, difference)])
	return rows
