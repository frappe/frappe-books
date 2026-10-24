# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class BooksStockLedgerEntry(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		actual_qty: DF.Float
		batch_no: DF.Link | None
		company: DF.Link | None
		incoming_rate: DF.Currency
		is_cancelled: DF.Check
		item_code: DF.Link | None
		posting_date: DF.Date | None
		posting_datetime: DF.Datetime | None
		posting_time: DF.Time | None
		qty_after_transaction: DF.Float
		serial_no: DF.Link | None
		stock_queue: DF.LongText | None
		stock_value: DF.Currency
		stock_value_difference: DF.Currency
		voucher_no: DF.DynamicLink | None
		voucher_type: DF.Link | None
		warehouse: DF.Link | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Stock Ledger Entry"


def on_doctype_update():
	frappe.db.add_index(
		"Books Stock Ledger Entry", ["item_code", "warehouse", "batch_no", "posting_datetime"]
	)
