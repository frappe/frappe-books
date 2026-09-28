# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from frappe_books.customization import get_saved_definition


class BooksCustomField(Document):
	"""Places a Custom Field on a /books form.

	The Custom Field owns the definition, which the virtual fields show. Values set on the row, read
	with `get`, are what saving the form writes to the Custom Field.
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

	@property
	def label(self):
		return self.saved_definition.get("label")

	@property
	def fieldtype(self):
		return self.saved_definition.get("fieldtype")

	@property
	def is_required(self):
		return self.saved_definition.get("is_required")

	@property
	def default(self):
		return self.saved_definition.get("default")

	@property
	def options(self):
		return self.saved_definition.get("options")

	@property
	def target(self):
		return self.saved_definition.get("target")

	@property
	def references(self):
		return self.saved_definition.get("references")

	@property
	def saved_definition(self) -> dict:
		return get_saved_definition(self.parent, self.fieldname)
