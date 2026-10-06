# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.locale import get_number_format
from frappe.model.document import Document
from frappe.utils import cint

from frappe_books.formats import frappe_date_format, frappe_number_format
from frappe_books.settings import update_frappe_settings

# Frappe's System Settings fields that follow Books fields, with the Frappe value of a Books value.
FRAPPE_FORMATS = {
	"date_format": ("date_format", frappe_date_format),
	"locale": ("number_format", frappe_number_format),
}


class BooksSystemSettings(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		allow_filter_bypass: DF.Check
		currency: DF.Link | None
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

	@property
	def display_precision(self):
		"""The decimals of amounts, which Frappe's System Settings hold as the Currency Precision."""
		return get_display_precision()

	def on_update(self):
		# Only a changed format goes, so other saves need no right to System Settings.
		# The first save (app install) has nothing to change: Frappe keeps its formats.
		if not self.get_doc_before_save():
			return
		self.update_frappe_formats(
			[fieldname for fieldname in FRAPPE_FORMATS if self.has_value_changed(fieldname)]
		)

	def update_frappe_formats(self, fieldnames=tuple(FRAPPE_FORMATS)):
		"""Set Frappe's date and number formats to the closest of the Books ones, for Frappe's own output."""
		values = {}
		for fieldname in fieldnames:
			frappe_field, to_frappe = FRAPPE_FORMATS[fieldname]
			values[frappe_field] = to_frappe(self.get(fieldname))
		update_frappe_settings("System Settings", values)


def get_display_precision() -> int:
	"""Frappe's Currency Precision, else the decimals of its number format."""
	precision = frappe.db.get_default("currency_precision")
	return get_number_format().precision if precision in (None, "") else cint(precision)


@frappe.whitelist(methods=["POST"])
def set_display_precision(display_precision: int) -> None:
	"""Set Frappe's Currency Precision, which Books System Settings shows as the Display Precision.

	A save of the settings leaves it alone, so no stored copy can set it back.
	"""
	frappe.has_permission("Books System Settings", "write", throw=True)
	if not 0 <= display_precision <= 9:
		frappe.throw(_("Display Precision should have a value between 0 and 9."))
	if display_precision != get_display_precision():
		update_frappe_settings("System Settings", {"currency_precision": str(display_precision)})
