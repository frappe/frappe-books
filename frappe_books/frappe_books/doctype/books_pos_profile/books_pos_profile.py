# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from frappe_books.printing import validate_print_format


class BooksPOSProfile(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		allow_discount_change: DF.Check
		allow_rate_change: DF.Check
		cancel_button_colour: DF.Color | None
		company: DF.Link | None
		customer: DF.Link | None
		held_button_colour: DF.Color | None
		hide_unavailable_items: DF.Check
		ignore_pricing_rule: DF.Check
		item_visibility: DF.Literal["Inventory Items", "Non-Inventory Items", "All Items"]
		pay_button_colour: DF.Color | None
		pos_ui: DF.Literal["Classic", "Modern"]
		print_format: DF.Link | None
		return_button_colour: DF.Color | None
		save_button_colour: DF.Color | None
		warehouse: DF.Link
	# end: auto-generated types

	_DOCTYPE_NAME = "Books POS Profile"

	def validate(self):
		validate_print_format(self.print_format, "Books Sales Invoice")
