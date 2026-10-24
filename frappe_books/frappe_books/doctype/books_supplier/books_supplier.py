# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe

from frappe_books.accounting.party import PartyController, map_invoice


class BooksSupplier(PartyController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		address: DF.Link | None
		default_account: DF.Link | None
		default_currency: DF.Link | None
		email: DF.Data | None
		gst_category: DF.Literal["Registered Regular", "Unregistered"]
		gstin: DF.Data | None
		image: DF.AttachImage | None
		outstanding_amount: DF.Currency
		phone: DF.Data | None
		supplier_name: DF.Data
		tax_id: DF.Data | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Supplier"


@frappe.whitelist()
def make_purchase_invoice(source_name: str):
	return map_invoice("Books Supplier", source_name, "Books Purchase Invoice")
