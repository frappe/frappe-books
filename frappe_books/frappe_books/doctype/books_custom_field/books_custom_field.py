# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from frappe_books.customization import get_saved_definition


class BooksCustomField(Document):
	"""Places a Custom Field on a /books form.

	The Custom Field owns the definition. The row's virtual fields hold it: loading fills them from
	the Custom Field, and saving the form writes them back. Frappe reads a virtual field through its
	property, so each property returns the row's value.
	"""

	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		fieldname: DF.Data
		fieldtype: DF.Literal[
			"Data",
			"Select",
			"Link",
			"Date",
			"Datetime",
			"Table",
			"AutoComplete",
			"Check",
			"AttachImage",
			"DynamicLink",
			"Int",
			"Float",
			"Currency",
			"Text",
			"Color",
			"Attachment",
		]
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		section: DF.Data | None
		tab: DF.Data | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Custom Field"

	def __setup__(self):
		# A row read from the database holds only its placement. Values a caller sets are kept.
		if self.get("parent") and self.get("fieldname"):
			for fieldname, value in get_saved_definition(self.parent, self.fieldname).items():
				self.__dict__.setdefault(fieldname, value)

	@property
	def label(self):
		return self.get("label")

	@property
	def fieldtype(self):
		return self.get("fieldtype")

	@property
	def is_required(self):
		return self.get("is_required")

	@property
	def default(self):
		return self.get("default")

	@property
	def options(self):
		return self.get("options")

	@property
	def target(self):
		return self.get("target")

	@property
	def references(self):
		return self.get("references")
