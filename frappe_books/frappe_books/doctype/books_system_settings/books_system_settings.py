# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.locale import get_number_format
from frappe.model.document import Document
from frappe.utils import get_currency_precision

from frappe_books.settings import update_system_settings


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

	@property
	def display_precision(self):
		"""The decimals of amounts, which Frappe's System Settings hold as the Currency Precision."""
		return get_display_precision()


def get_display_precision() -> int:
	"""Frappe's Currency Precision, else the decimals of its number format."""
	precision = get_currency_precision()
	return get_number_format().precision if precision is None else precision


@frappe.whitelist(methods=["POST"])
def set_display_precision(display_precision: int) -> None:
	"""Set Frappe's Currency Precision, which Books System Settings shows as the Display Precision.

	A save of the settings leaves it alone, so no stored copy can set it back.
	"""
	frappe.has_permission("Books System Settings", "write", throw=True)
	if not 0 <= display_precision <= 9:
		frappe.throw(_("Display Precision should have a value between 0 and 9."))
	if display_precision != get_display_precision():
		update_system_settings({"currency_precision": str(display_precision)})
