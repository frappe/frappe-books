# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.accounting.ledger import (
	LedgerPosting,
	delete_entries,
	reverse_entries,
	validate_leaf_accounts,
)
from frappe_books.accounting.money import as_decimal
from frappe_books.permissions import check_preview_permission
from frappe_books.series import SeriesNamingMixin


class BooksJournalEntry(SeriesNamingMixin, Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_journal_entry_account.books_journal_entry_account import (
			BooksJournalEntryAccount,
		)

		accounts: DF.Table[BooksJournalEntryAccount]
		amended_from: DF.Link | None
		cheque_date: DF.Date | None
		cheque_no: DF.Data | None
		company: DF.Link | None
		naming_series: DF.Link
		posting_date: DF.Date
		total_credit: DF.Currency
		total_debit: DF.Currency
		user_remark: DF.SmallText | None
		voucher_type: DF.Literal[
			"Journal Entry",
			"Bank Entry",
			"Cash Entry",
			"Credit Card Entry",
			"Debit Note",
			"Credit Note",
			"Contra Entry",
			"Excise Entry",
			"Write Off Entry",
			"Opening Entry",
			"Depreciation Entry",
		]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Journal Entry"

	@frappe.whitelist()
	def preview(self):
		"""Fill the values a save would fill, without saving, for the form to show them."""
		check_preview_permission(self)
		self.set_number_series()

	def validate(self):
		if len(self.accounts) < 2:
			frappe.throw(_("Journal entry requires at least two account rows."))
		validate_leaf_accounts({row.account for row in self.accounts})
		for row in self.accounts:
			_validate_amounts(row)
			_set_company_amounts(row)
		self.total_debit = sum((as_decimal(row.debit) for row in self.accounts), as_decimal(0))
		self.total_credit = sum((as_decimal(row.credit) for row in self.accounts), as_decimal(0))
		if self.total_debit == 0:
			frappe.throw(_("Journal entry total must be greater than zero."))
		if self.total_debit != self.total_credit:
			frappe.throw(
				_("Total debit {0} must equal total credit {1}.").format(self.total_debit, self.total_credit)
			)

	def on_submit(self):
		posting = LedgerPosting(self)
		for row in self.accounts:
			posting.debit(row.account, row.debit)
			posting.credit(row.account, row.credit)
		posting.post()

	def on_cancel(self):
		reverse_entries(self)

	def on_trash(self):
		delete_entries(self)


def _validate_amounts(row):
	debit = as_decimal(row.debit_in_account_currency)
	credit = as_decimal(row.credit_in_account_currency)
	if debit < 0 or credit < 0:
		frappe.throw(_("Debit and credit amounts cannot be negative."))
	if (debit == 0) == (credit == 0):
		frappe.throw(_("Each account row must contain either a debit or a credit."))


def _set_company_amounts(row):
	"""Books has one currency, so the company amounts are the account amounts, as ERPNext's at rate 1."""
	row.debit = row.debit_in_account_currency
	row.credit = row.credit_in_account_currency
