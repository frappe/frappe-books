# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class BooksStockEntryDetail(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		amount: DF.Currency
		basic_rate: DF.Currency
		batch_no: DF.Link | None
		conversion_factor: DF.Float
		item_code: DF.Link
		item_name: DF.Data | None
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		qty: DF.Float
		s_warehouse: DF.Link | None
		serial_no: DF.Text | None
		stock_uom: DF.Link | None
		t_warehouse: DF.Link | None
		transfer_qty: DF.Float
		uom: DF.Link | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Stock Entry Detail"
