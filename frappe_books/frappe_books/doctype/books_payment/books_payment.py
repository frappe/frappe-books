# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe_books.accounting.payment import PaymentController


class BooksPayment(PaymentController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_payment_for.books_payment_for import (
			BooksPaymentFor,
		)
		from frappe_books.frappe_books.doctype.books_tax_summary.books_tax_summary import (
			BooksTaxSummary,
		)

		account: DF.Link
		amended_from: DF.Link | None
		amount: DF.Currency
		amount_paid: DF.Currency
		attachment: DF.Attach | None
		clearance_date: DF.Date | None
		date: DF.Datetime
		number_series: DF.Link
		party: DF.Link
		payment_account: DF.Link
		payment_method: DF.Link
		payment_references: DF.Table[BooksPaymentFor]
		payment_type: DF.Literal["", "Receive", "Pay"]
		reference_date: DF.Date | None
		reference_id: DF.Data | None
		reference_type: DF.Literal["", "SalesInvoice", "PurchaseInvoice"]
		status: DF.Literal["Saved", "Submitted", "Cancelled"]
		taxes: DF.Table[BooksTaxSummary]
		writeoff: DF.Currency
	# end: auto-generated types

	pass
