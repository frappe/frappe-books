# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from frappe_books.settings import update_frappe_settings


class BooksPrintSettings(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		address: DF.Link | None
		amount_in_words: DF.Check
		color: DF.Color | None
		company_name: DF.Data | None
		display_description: DF.Check
		display_logo: DF.Check
		display_time: DF.Check
		displaytermsandconditions: DF.Check
		email: DF.Data | None
		font: DF.Literal["Default", "Helvetica Neue", "Arial", "Helvetica", "Inter", "Verdana", "Monospace"]
		logo: DF.AttachImage | None
		phone: DF.Data | None
		terms_and_conditions: DF.Text | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Print Settings"

	@property
	def font(self):
		"""The print font, which Frappe's Print Settings hold."""
		return frappe.db.get_single_value("Print Settings", "font")


@frappe.whitelist(methods=["POST"])
def set_font(font: str) -> None:
	"""Set the font of Frappe's Print Settings, which Books Print Settings shows.

	A save of the settings leaves it alone, so no stored copy can set it back.
	"""
	frappe.has_permission("Books Print Settings", "write", throw=True)
	update_frappe_settings("Print Settings", {"font": font})
