# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class BooksLedgerEntry(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		account: DF.Link
		company: DF.Link | None
		credit: DF.Currency
		debit: DF.Currency
		name: DF.Int | None
		party: DF.DynamicLink | None
		party_type: DF.Link | None
		posting_date: DF.Date | None
		reverted: DF.Check
		reverts: DF.Link | None
		voucher_no: DF.DynamicLink | None
		voucher_type: DF.Link | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Ledger Entry"
