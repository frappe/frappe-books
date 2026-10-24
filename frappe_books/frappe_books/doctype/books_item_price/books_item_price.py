# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.permissions import check_preview_permission


class BooksItemPrice(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		buying: DF.Check
		currency: DF.Link | None
		item_code: DF.Link
		price_list: DF.Link
		price_list_rate: DF.Currency
		selling: DF.Check
		uom: DF.Link
		valid_from: DF.Date | None
		valid_upto: DF.Date | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Item Price"

	@frappe.whitelist()
	def preview(self):
		"""Fill the unit a save would fetch from the item, without saving, for the form to show it."""
		check_preview_permission(self)
		self.get_invalid_links()

	def validate(self):
		self.validate_from_to_dates("valid_from", "valid_upto")
		self.update_price_list_details()
		self.check_duplicates()

	def update_price_list_details(self):
		"""An enabled price list gives its price its currency and sides, as ERPNext copies them."""
		details = frappe.db.get_value(
			"Books Price List", {"name": self.price_list, "enabled": 1}, ["buying", "selling", "currency"]
		)
		if not details:
			frappe.throw(_("The price list {0} does not exist or is disabled").format(self.price_list))
		self.buying, self.selling, self.currency = details

	def check_duplicates(self):
		if self.duplicate_price_query().run():
			frappe.throw(
				_(
					"Item Price appears multiple times based on Price List, Supplier/Customer, Currency, Item, Batch, UOM, Qty, and Dates."
				)
			)

	def duplicate_price_query(self):
		"""Another price of the item in the list, for the same unit and start date, as ERPNext matches it."""
		item_price = frappe.qb.DocType("Books Item Price")
		query = (
			frappe.qb.from_(item_price)
			.select(item_price.name)
			.where(
				(item_price.item_code == self.item_code)
				& (item_price.price_list == self.price_list)
				& (item_price.name != self.name)
			)
		)
		for fieldname in ("uom", "valid_from"):
			column = item_price[fieldname]
			value = self.get(fieldname)
			query = query.where(column == value if value else column.isnull())
		return query
