# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from frappe_books.printing import validate_print_format


class BooksPosProfile(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		can_change_rate: DF.Check
		can_edit_discount: DF.Check
		cancel_button_colour: DF.Color | None
		held_button_colour: DF.Color | None
		hide_unavailable_items: DF.Check
		ignore_pricing_rule: DF.Check
		inventory: DF.Link
		item_visibility: DF.Literal["Inventory Items", "Non-Inventory Items", "All Items"]
		pay_button_colour: DF.Color | None
		pos_customer: DF.Link | None
		pos_print_template: DF.Link | None
		pos_ui: DF.Literal["Classic", "Modern"]
		return_button_colour: DF.Color | None
		save_button_colour: DF.Color | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Pos Profile"

	def validate(self):
		validate_print_format(self.pos_print_template, "Books Sales Invoice")
