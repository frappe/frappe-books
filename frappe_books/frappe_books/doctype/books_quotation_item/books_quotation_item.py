# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class BooksQuotationItem(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		amount: DF.Currency
		conversion_factor: DF.Float
		description: DF.TextEditor | None
		discount_amount: DF.Currency
		discount_percentage: DF.Percent
		gst_hsn_code: DF.Data | None
		is_manual_rate: DF.Check
		item_code: DF.Link
		item_name: DF.Data
		item_tax_template: DF.Link | None
		net_amount: DF.Currency
		net_rate: DF.Currency
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		price_list_rate: DF.Currency
		qty: DF.Float
		rate: DF.Currency
		stock_qty: DF.Float
		stock_uom: DF.Link | None
		stock_uom_rate: DF.Currency
		uom: DF.Link | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Quotation Item"
