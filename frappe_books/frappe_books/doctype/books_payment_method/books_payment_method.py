# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from frappe_books.accounting.accounts import validate_payment_account


class BooksPaymentMethod(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		account: DF.Link | None
		requires_clearance_date: DF.Check
		type: DF.Literal["Cash", "Bank", "Transfer"]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Payment Method"

	def validate(self):
		validate_payment_account(self, "account", self.type)
