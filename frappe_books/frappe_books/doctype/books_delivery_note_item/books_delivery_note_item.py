# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class BooksDeliveryNoteItem(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		against_sales_invoice: DF.Link | None
		amount: DF.Currency
		batch_no: DF.Link | None
		conversion_factor: DF.Float
		description: DF.TextEditor | None
		discount_amount: DF.Currency
		discount_percentage: DF.Float
		gst_hsn_code: DF.Data | None
		item_code: DF.Link
		item_name: DF.Data
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		qty: DF.Float
		rate: DF.Currency
		serial_no: DF.Text | None
		si_detail: DF.Data | None
		stock_qty: DF.Float
		stock_uom: DF.Link | None
		stock_uom_rate: DF.Currency
		uom: DF.Link | None
		warehouse: DF.Link
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Delivery Note Item"
