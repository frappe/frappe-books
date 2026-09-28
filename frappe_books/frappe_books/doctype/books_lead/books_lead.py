# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


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
			"Open", "Replied", "Interested", "Opportunity", "Converted", "Quotation", "Do not Contact"
		]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Lead"
