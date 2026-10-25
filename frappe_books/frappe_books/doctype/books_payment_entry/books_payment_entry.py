# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe_books.accounting.payment import PaymentController


class BooksPaymentEntry(PaymentController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_payment_entry_deduction.books_payment_entry_deduction import (
			BooksPaymentEntryDeduction,
		)
		from frappe_books.frappe_books.doctype.books_payment_entry_reference.books_payment_entry_reference import (
			BooksPaymentEntryReference,
		)
		from frappe_books.frappe_books.doctype.books_realised_tax.books_realised_tax import (
			BooksRealisedTax,
		)

		amended_from: DF.Link | None
		clearance_date: DF.Date | None
		company: DF.Link | None
		deductions: DF.Table[BooksPaymentEntryDeduction]
		mode_of_payment: DF.Link
		naming_series: DF.Link
		paid_amount: DF.Currency
		paid_from: DF.Link
		paid_to: DF.Link
		party: DF.DynamicLink | None
		party_type: DF.Link | None
		payment_type: DF.Literal["", "Receive", "Pay", "Internal Transfer"]
		posting_date: DF.Date
		realised_taxes: DF.Table[BooksRealisedTax]
		received_amount: DF.Currency
		reference_date: DF.Date | None
		reference_no: DF.Data | None
		references: DF.Table[BooksPaymentEntryReference]
		status: DF.Literal["Draft", "Submitted", "Cancelled"]
		total_allocated_amount: DF.Currency
		unallocated_amount: DF.Currency
	# end: auto-generated types

	pass
