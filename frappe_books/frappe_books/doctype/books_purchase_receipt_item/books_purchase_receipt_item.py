# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class BooksPurchaseReceiptItem(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		amount: DF.Currency
		batch: DF.Link | None
		description: DF.Text | None
		hsn_code: DF.Data | None
		item: DF.Link
		item_discount_amount: DF.Currency
		item_discount_percent: DF.Float
		location: DF.Link
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		quantity: DF.Float
		rate: DF.Currency
		serial_number: DF.Text | None
		transfer_quantity: DF.Float
		transfer_unit: DF.Link | None
		unit: DF.Link | None
		unit_conversion_factor: DF.Float
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Purchase Receipt Item"
