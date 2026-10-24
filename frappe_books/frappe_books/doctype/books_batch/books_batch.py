# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class BooksBatch(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		batch_id: DF.Data
		expiry_date: DF.Date | None
		item: DF.Link | None
		manufacturing_date: DF.Date | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Batch"
