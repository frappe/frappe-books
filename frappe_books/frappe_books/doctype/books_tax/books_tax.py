# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from frappe_books.accounting.ledger import validate_leaf_accounts


class BooksTax(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_tax_detail.books_tax_detail import BooksTaxDetail

		details: DF.Table[BooksTaxDetail]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Tax"

	def validate(self):
		# Invoices post to these accounts.
		accounts = {row.get(field) for row in self.details for field in ("account", "payment_account")}
		validate_leaf_accounts(accounts - {None, ""})
