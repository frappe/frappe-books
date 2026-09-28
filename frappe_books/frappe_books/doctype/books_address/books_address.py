# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document

from frappe_books.regional import populate_address


class BooksAddress(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		address_display: DF.Text | None
		address_line1: DF.Data
		address_line2: DF.Data | None
		city: DF.Data
		country: DF.Link
		email_address: DF.Data | None
		fax: DF.Data | None
		phone: DF.Data | None
		pos: DF.Autocomplete | None
		postal_code: DF.Data | None
		state: DF.Autocomplete | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Address"

	def before_validate(self):
		populate_address(self)
