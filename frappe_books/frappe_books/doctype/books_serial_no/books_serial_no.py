# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class BooksSerialNo(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		company: DF.Link | None
		description: DF.Text | None
		item_code: DF.Link
		serial_no: DF.Data
		status: DF.Literal["", "Active", "Inactive", "Consumed", "Delivered", "Expired"]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Serial No"
