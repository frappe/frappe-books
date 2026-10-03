# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from frappe_books.regional import validate_hsn_codes


class BooksItemGroup(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		hsn_code: DF.Data | None
		image: DF.AttachImage | None
		tax: DF.Link | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Item Group"

	def validate(self):
		validate_hsn_codes([self])
