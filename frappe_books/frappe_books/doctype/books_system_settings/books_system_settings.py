# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint


class BooksSystemSettings(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		allow_filter_bypass: DF.Check
		currency: DF.Link | None
		dark_mode: DF.Check
		date_format: DF.Autocomplete
		display_precision: DF.Int
		hide_get_started: DF.Check
		internal_precision: DF.Int
		locale: DF.Autocomplete
		remove_filter: DF.Check
	# end: auto-generated types

	_DOCTYPE_NAME = "Books System Settings"

	@property
	def currency(self):
		"""The company currency, which Frappe's System Settings holds."""
		return frappe.db.get_single_value("System Settings", "currency")

	def validate(self):
		# The DocField limits are checked by Frappe after this, in other words than /books shows at the field.
		if not 0 <= cint(self.display_precision) <= 9:
			frappe.throw(_("Display Precision should have a value between 0 and 9."))
