# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from frappe_books.accounting.money import company_currency
from frappe_books.permissions import check_preview_permission


class BooksPriceList(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		buying: DF.Check
		currency: DF.Link
		enabled: DF.Check
		price_list_name: DF.Data
		selling: DF.Check
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Price List"

	def before_validate(self):
		self.set_missing_values()

	def set_missing_values(self):
		self.currency = self.currency or company_currency()

	@frappe.whitelist()
	def preview(self):
		"""Fill the currency a save would fill, without saving, for the form to show it."""
		check_preview_permission(self)
		self.set_missing_values()

	def on_update(self):
		"""Its prices keep the currency and sides of the list, as ERPNext keeps them."""
		item_price = frappe.qb.DocType("Books Item Price")
		(
			frappe.qb.update(item_price)
			.set(item_price.currency, self.currency)
			.set(item_price.buying, self.buying)
			.set(item_price.selling, self.selling)
			.where(item_price.price_list == self.name)
		).run()
