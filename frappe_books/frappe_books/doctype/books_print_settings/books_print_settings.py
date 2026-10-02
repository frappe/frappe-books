# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


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
		font: DF.Literal["Arial", "Times New Roman", "Courier"]
		logo: DF.AttachImage | None
		phone: DF.Data | None
		terms_and_conditions: DF.Text | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Print Settings"
