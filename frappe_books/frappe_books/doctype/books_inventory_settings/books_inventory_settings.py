# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.accounting.accounts import validate_changed_accounts
from frappe_books.commerce.pos import open_shift_name
from frappe_books.settings import validate_one_way_switches

ONE_WAY_SWITCHES = ("enable_barcodes", "enable_batches", "enable_serial_number", "enable_uom_conversions")

ACCOUNT_TYPES = {
	"stock_in_hand": {"account_types": ("Stock",)},
	"stock_received_but_not_billed": {"account_types": ("Stock Received But Not Billed",)},
	"cost_of_goods_sold": {"account_types": ("Cost of Goods Sold",)},
	"stock_adjustment": {"account_types": ("Stock Adjustment",)},
}


class BooksInventorySettings(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		cost_of_goods_sold: DF.Link | None
		default_location: DF.Link | None
		enable_barcodes: DF.Check
		enable_batches: DF.Check
		enable_point_of_sale: DF.Check
		enable_serial_number: DF.Check
		enable_uom_conversions: DF.Check
		stock_adjustment: DF.Link | None
		stock_in_hand: DF.Link | None
		stock_received_but_not_billed: DF.Link | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Inventory Settings"

	def validate(self):
		validate_one_way_switches(self, ONE_WAY_SWITCHES)
		validate_changed_accounts(self, ACCOUNT_TYPES)
		if (
			self.has_value_changed("enable_point_of_sale")
			and not self.enable_point_of_sale
			and open_shift_name()
		):
			frappe.throw(_("Close the open POS shift before disabling Point of Sale."))
