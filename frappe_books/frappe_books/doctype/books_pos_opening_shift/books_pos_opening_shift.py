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
	validate_cash_rows,
)
from frappe_books.permissions import check_preview_permission


class BooksPosOpeningShift(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_opening_amounts.books_opening_amounts import (
			BooksOpeningAmounts,
		)
		from frappe_books.frappe_books.doctype.books_opening_cash.books_opening_cash import (
			BooksOpeningCash,
		)

		amended_from: DF.Link | None
		journal_entry: DF.Link | None
		opening_amounts: DF.Table[BooksOpeningAmounts]
		opening_cash: DF.Table[BooksOpeningCash]
		opening_date: DF.Datetime | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Pos Opening Shift"

	def validate(self):
		if self._action == "submit" or not self.opening_date:
			# The shift opens when it is submitted, as its closing shift closes it.
			self.opening_date = now_datetime()
		if cash_total(self.opening_cash) < 0:
			frappe.throw(_("Opening Cash Amount can not be negative."))
		validate_cash_rows(self.opening_cash)
		amounts = self.get_opening_amounts()
		cash = sum_decimal(amount for method, amount in amounts.items() if is_cash_method(method))
		if rounded(cash) != cash_total(self.opening_cash):
			frappe.throw(_("Opening Cash amount must equal the denomination total."))

	@frappe.whitelist()
	def preview(self):
		"""Fill the opening cash amount a save expects, without saving."""
		check_preview_permission(self)
		self.set_opening_cash_amount()

	def set_opening_cash_amount(self):
		"""The counted cash is the first cash method's opening amount."""
		cash_row = next((row for row in self.opening_amounts if is_cash_method(row.payment_method)), None)
		if cash_row:
			cash_row.amount = cash_total(self.opening_cash)

	def before_submit(self):
		lock_pos_settings()
		if open_shift_name():
			frappe.throw(_("A POS shift is already open."))

	def on_submit(self):
		total = cash_total(self.opening_cash)
		counter = frappe.db.get_single_value("Books Pos Settings", "cash_account")
		journal = make_cash_journal(
			self.opening_date,
			[(counter, total, 0), (cash_account(), 0, total)],
			_("POS opening shift {0}").format(self.name),
		)
		self.db_set("journal_entry", journal)

	def on_cancel(self):
		cancel_cash_journal(self.journal_entry)

	def get_opening_amounts(self):
		amounts = {}
		for row in self.opening_amounts:
			if row.payment_method in amounts:
				frappe.throw(_("Payment method {0} is listed more than once.").format(row.payment_method))
			if as_decimal(row.amount) < 0:
				frappe.throw(_("POS amounts cannot be negative."))
			amounts[row.payment_method] = as_decimal(row.amount)
		return amounts


@frappe.whitelist()
def get_open_shift() -> str | None:
	"""Return the name of the open POS shift, if there is one."""
	frappe.has_permission("Books Pos Opening Shift", "read", throw=True)
	return open_shift_name()
