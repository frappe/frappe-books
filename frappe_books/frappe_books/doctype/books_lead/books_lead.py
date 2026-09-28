# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from frappe_books.settings import require_feature


class BooksLead(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		address: DF.Link | None
		email: DF.Data | None
		mobile: DF.Data | None
		status: DF.Literal[
			"Open", "Replied", "Interested", "Opportunity", "Converted", "Quotation", "DonotContact"
		]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Lead"

	def validate(self):
		require_feature("enable_lead")
