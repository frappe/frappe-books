# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from frappe.model.naming import NamingSeries

from frappe_books.series import series_pattern, validate_prefix


class BooksNumberSeries(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		pad_zeros: DF.Int
		reference_type: DF.Literal[
			"-",
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
		validate_prefix(self.name)
		NamingSeries(self.pattern).validate()

	def after_insert(self):
		self.start_counter()

	def after_rename(self, old, new, merge):
		self.start_counter()

	def start_counter(self):
		"""Count from `start`, unless the prefix already counted past it."""
		series = NamingSeries(self.pattern)
		if series.get_current_value() < self.start - 1:
			series.update_counter(self.start - 1)
