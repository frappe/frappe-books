# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class BooksUOMConversionDetail(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		conversion_factor: DF.Float
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		uom: DF.Link
	# end: auto-generated types

	_DOCTYPE_NAME = "Books UOM Conversion Detail"
