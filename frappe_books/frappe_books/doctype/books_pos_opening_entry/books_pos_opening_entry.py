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


class BooksPOSOpeningEntry(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_opening_cash.books_opening_cash import BooksOpeningCash
		from frappe_books.frappe_books.doctype.books_pos_opening_entry_detail.books_pos_opening_entry_detail import (
			BooksPOSOpeningEntryDetail,
		)

		amended_from: DF.Link | None
		balance_details: DF.Table[BooksPOSOpeningEntryDetail]
		company: DF.Link | None
		journal_entry: DF.Link | None
		opening_cash: DF.Table[BooksOpeningCash]
		period_start_date: DF.Datetime
	# end: auto-generated types

	_DOCTYPE_NAME = "Books POS Opening Entry"

	def validate(self):
		if self._action == "submit" or not self.period_start_date:
			# The shift opens when it is submitted, as its closing shift closes it.
			self.period_start_date = now_datetime()
		if cash_total(self.opening_cash) < 0:
			frappe.throw(_("Opening Cash Amount can not be negative."))
		validate_cash_rows(self.opening_cash)
		amounts = self.get_opening_amounts()
		cash = sum_decimal(amount for method, amount in amounts.items() if is_cash_method(method))
		if rounded(cash) != cash_total(self.opening_cash):
			frappe.throw(_("Opening Cash amount must equal the denomination total."))

	@frappe.whitelist()
	def preview(self):
		"""Fill the start date, a row per mode of payment and the opening cash amount, without saving."""
		check_preview_permission(self)
		self.period_start_date = self.period_start_date or now_datetime()
		self.set_balance_details()
		self.set_opening_cash_amount()

	def set_balance_details(self):
		"""A new shift lists every mode of payment, as the POS takes them all."""
		if self.balance_details:
			return
		for mode in frappe.get_all("Books Mode of Payment", pluck="name", order_by="creation desc"):
			self.append("balance_details", {"mode_of_payment": mode, "opening_amount": 0})

	def set_opening_cash_amount(self):
		"""The counted cash is the first cash method's opening amount."""
		cash_row = next((row for row in self.balance_details if is_cash_method(row.mode_of_payment)), None)
		if cash_row:
			cash_row.opening_amount = cash_total(self.opening_cash)

	def before_submit(self):
		lock_pos_settings()
		if open_shift_name():
			frappe.throw(_("A POS shift is already open."))

	def on_submit(self):
		total = cash_total(self.opening_cash)
		counter = frappe.db.get_single_value("Books POS Settings", "cash_account")
		journal = make_cash_journal(
			self.period_start_date,
			[(counter, total, 0), (cash_account(), 0, total)],
			_("POS opening shift {0}").format(self.name),
		)
		self.db_set("journal_entry", journal)

	def on_cancel(self):
		cancel_cash_journal(self.journal_entry)

	def get_opening_amounts(self):
		amounts = {}
		for row in self.balance_details:
			if row.mode_of_payment in amounts:
				frappe.throw(_("Payment method {0} is listed more than once.").format(row.mode_of_payment))
			if as_decimal(row.opening_amount) < 0:
				frappe.throw(_("POS amounts cannot be negative."))
			amounts[row.mode_of_payment] = as_decimal(row.opening_amount)
		return amounts


@frappe.whitelist()
def get_open_shift() -> str | None:
	"""Return the name of the open POS shift, if there is one."""
	frappe.has_permission("Books POS Opening Entry", "read", throw=True)
	return open_shift_name()
