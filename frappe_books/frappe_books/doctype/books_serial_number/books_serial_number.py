# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from frappe_books.inventory.stock import available_serial_numbers


class BooksSerialNumber(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		description: DF.Text | None
		item: DF.Link
		status: DF.Literal["Inactive", "Active", "Delivered"]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Serial Number"


@frappe.whitelist()
def get_available_serial_numbers(item: str, location: str, quantity: int) -> list[str]:
	"""Return the serial numbers a sale of the item takes first from the location."""
	frappe.has_permission("Books Serial Number", "read", throw=True)
	return available_serial_numbers(item, location, quantity)
