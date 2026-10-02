# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.permissions import check_preview_permission


class BooksPriceList(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_price_list_item.books_price_list_item import (
			BooksPriceListItem,
		)

		is_enabled: DF.Check
		is_purchase: DF.Check
		is_sales: DF.Check
		price_list_item: DF.Table[BooksPriceListItem]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Price List"

	@frappe.whitelist()
	def preview(self):
		"""Fill each row's unit from its item, as a save would, for the form to show it."""
		check_preview_permission(self)
		for row in self.price_list_item:
			row.get_invalid_links()

	def validate(self):
		"""One price per item and unit, so the rate an invoice gets is never ambiguous."""
		priced = set()
		for row in self.price_list_item:
			if (row.item, row.unit) in priced:
				frappe.throw(
					_("Row {0}: {1} already has a price in {2}.").format(row.idx, row.item, row.unit)
				)
			priced.add((row.item, row.unit))
