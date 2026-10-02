# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe import _
from frappe.model.document import Document
from frappe.model.naming import NamingSeries

from frappe_books.series import INVALID_PREFIX_CHARACTERS, series_pattern, start_series, validate_prefix


class BooksNumberSeries(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		pad_zeros: DF.Int
		reference_type: DF.Literal[
			"",
			"SalesInvoice",
			"SalesQuote",
			"PurchaseInvoice",
			"Payment",
			"JournalEntry",
			"StockMovement",
			"Shipment",
			"PurchaseReceipt",
			"PricingRule",
		]
		start: DF.Int
	# end: auto-generated types

	@property
	def pattern(self) -> str:
		return series_pattern(self.name, self.pad_zeros)

	@property
	def current(self) -> int:
		return NamingSeries(self.pattern).get_current_value()

	def validate(self):
		message = _("The following characters cannot be used {0} in a Number Series name.")
		validate_prefix(self.name, message.format(INVALID_PREFIX_CHARACTERS))

	def after_insert(self):
		start_series(self.pattern, self.start)

	def after_rename(self, old, new, merge):
		start_series(self.pattern, self.start)
