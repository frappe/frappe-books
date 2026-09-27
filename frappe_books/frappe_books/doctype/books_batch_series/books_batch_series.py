# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from frappe_books.series import validate_series


class BooksBatchSeries(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		current: DF.Int
		pad_zeros: DF.Int
		start: DF.Int
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Batch Series"

	def validate(self):
		validate_series(self)
