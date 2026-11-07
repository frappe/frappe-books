# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class BooksBatch(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		expiry_date: DF.Date | None
		item: DF.Link
		manufacture_date: DF.Date | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Batch"

	def validate(self):
		if (
			self.expiry_date
			and self.manufacture_date
			and getdate(self.expiry_date) < getdate(self.manufacture_date)
		):
			frappe.throw(_("Expiry Date cannot be before Manufacture Date."))
