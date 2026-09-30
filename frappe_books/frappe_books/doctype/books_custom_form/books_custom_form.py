# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from frappe_books.customization import (
	remove_custom_fields,
	set_custom_fieldnames,
	update_custom_fields,
	validate_custom_form,
)
from frappe_books.permissions import check_preview_permission


class BooksCustomForm(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_custom_field.books_custom_field import (
			BooksCustomField,
		)

		custom_fields: DF.Table[BooksCustomField]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Custom Form"

	def before_validate(self):
		set_custom_fieldnames(self)

	@frappe.whitelist()
	def preview(self):
		"""Fill what a save would fill, without saving, for the form to show it."""
		check_preview_permission(self)
		set_custom_fieldnames(self)

	def validate(self):
		validate_custom_form(self)

	def on_update(self):
		update_custom_fields(self)

	def on_trash(self):
		remove_custom_fields(self.name)
