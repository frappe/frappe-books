# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe_books.accounting.invoice import InvoiceItemController


class BooksSalesInvoiceItem(InvoiceItemController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		account: DF.Link
		amount: DF.Currency
		batch: DF.Link | None
		description: DF.Text | None
		hsn_code: DF.Int
		is_free_item: DF.Check
		is_manual_rate: DF.Check
		item: DF.Link
		item_code: DF.Data | None
		item_discount_amount: DF.Currency
		item_discount_percent: DF.Float
		item_discounted_total: DF.Currency
		item_taxed_total: DF.Currency
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		pricing_rule: DF.Data | None
		qty: DF.Float
		quantity: DF.Float
		rate: DF.Currency
		serial_number: DF.Text | None
		set_item_discount_amount: DF.Check
		stock_not_transferred: DF.Float
		tax: DF.Link | None
		transfer_quantity: DF.Float
		transfer_rate: DF.Currency
		transfer_unit: DF.Link | None
		unit: DF.Link | None
		unit_conversion_factor: DF.Float
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Sales Invoice Item"
