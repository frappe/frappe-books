# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from frappe_books.accounting.ledger import validate_leaf_accounts


class BooksItemTaxTemplate(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_item_tax_template_detail.books_item_tax_template_detail import (
			BooksItemTaxTemplateDetail,
		)

		company: DF.Link | None
		taxes: DF.Table[BooksItemTaxTemplateDetail]
		title: DF.Data
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Item Tax Template"

	def validate(self):
		# Invoices post to these accounts.
		accounts = {row.get(field) for row in self.taxes for field in ("tax_type", "payment_account")}
		validate_leaf_accounts(accounts - {None, ""})
