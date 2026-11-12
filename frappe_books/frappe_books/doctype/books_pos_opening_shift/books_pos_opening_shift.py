# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_fullname, now_datetime

from frappe_books.accounting.money import as_decimal, rounded, sum_decimal
from frappe_books.commerce.pos import (
	cancel_cash_journal,
	cash_account,
	cash_total,
	is_cash_method,
	lock_pos_settings,
	make_cash_journal,
	open_shift_name,
	pos_profile,
	validate_cash_rows,
)
from frappe_books.permissions import check_preview_permission
from frappe_books.status import StatusMixin


class BooksPosOpeningShift(StatusMixin, Document):
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
		pos_profile: DF.Link | None
		status: DF.Literal["Saved", "Open", "Closed", "Cancelled"]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Pos Opening Shift"

	def validate(self):
		if self._action == "submit" or not self.opening_date:
			# The shift opens when it is submitted, as its closing shift closes it.
			self.opening_date = now_datetime()
		self.set_pos_profile()
		self.validate_no_open_shift()
		if cash_total(self.opening_cash) < 0:
			frappe.throw(_("Opening Cash Amount can not be negative."))
		validate_cash_rows(self.opening_cash)
		self.validate_opening_amounts()
		if self.opening_cash and self.get_cash_amount() != cash_total(self.opening_cash):
			frappe.throw(_("Opening Cash amount must equal the denomination total."))

	@frappe.whitelist()
	def preview(self):
		"""Fill the opening cash amount a save expects, without saving."""
		check_preview_permission(self)
		self.set_pos_profile()
		self.set_opening_cash_amount()

	def set_pos_profile(self):
		"""A shift sells with the profile POS Settings names, unless the cashier picks another."""
		if not self.pos_profile:
			self.pos_profile = frappe.db.get_single_value("Books Pos Settings", "pos_profile")

	def set_opening_cash_amount(self):
		"""The counted cash, if any, is the first cash method's opening amount."""
		if not self.opening_cash:
			return
		cash_row = next((row for row in self.opening_amounts if is_cash_method(row.payment_method)), None)
		if cash_row:
			cash_row.amount = cash_total(self.opening_cash)

	def before_submit(self):
		lock_pos_settings()
		self.validate_no_open_shift()

	def validate_no_open_shift(self):
		"""A cashier has one open shift at a time; a draft of another would only linger."""
		if open_shift_name(self.owner):
			frappe.throw(_("{0} already has an open POS shift.").format(get_fullname(self.owner)))

	def on_submit(self):
		total = self.get_cash_amount()
		counter = frappe.db.get_single_value("Books Pos Settings", "cash_account")
		journal = make_cash_journal(
			self.opening_date,
			[(counter, total, 0), (cash_account(), 0, total)],
			_("POS opening shift {0}").format(self.name),
		)
		self.db_set("journal_entry", journal)

	def on_cancel(self):
		cancel_cash_journal(self.journal_entry)

	def get_cash_amount(self):
		"""The cash the shift opens with: counted, or typed when the site sets no denominations."""
		return rounded(
			sum_decimal(row.amount for row in self.opening_amounts if is_cash_method(row.payment_method))
		)

	def validate_opening_amounts(self):
		methods = set()
		for row in self.opening_amounts:
			if row.payment_method in methods:
				frappe.throw(_("Payment method {0} is listed more than once.").format(row.payment_method))
			if as_decimal(row.amount) < 0:
				frappe.throw(_("POS amounts cannot be negative."))
			methods.add(row.payment_method)


@frappe.whitelist()
def get_open_shift() -> str | None:
	"""Return the name of the user's open POS shift, if there is one."""
	frappe.has_permission("Books Pos Opening Shift", "read", throw=True)
	return open_shift_name()


@frappe.whitelist()
def get_pos_profile() -> str | None:
	"""Return the POS profile the user's sales use."""
	frappe.has_permission("Books Pos Profile", "read", throw=True)
	return pos_profile()
