# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.accounting.accounts import validate_changed_accounts

# The longest GS1 item barcode, GTIN-14
MAX_BARCODE_DIGITS = 14
ACCOUNT_TYPES = {
	"cash_account": {"account_types": ("Cash",), "root_types": ("Asset",)},
	"write_off_account": {"root_types": ("Expense",)},
	"default_account": {"account_types": ("Receivable",)},
}


class BooksPOSSettings(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		allow_discount_change: DF.Check
		allow_rate_change: DF.Check
		cash_account: DF.Link
		check_digits: DF.Int
		default_account: DF.Link | None
		hide_unavailable_items: DF.Check
		ignore_pricing_rule: DF.Check
		item_code_digits: DF.Int
		item_visibility: DF.Literal["Inventory Items", "Non-Inventory Items", "All Items"]
		item_weight_digits: DF.Int
		pos_profile: DF.Link | None
		warehouse: DF.Link | None
		weight_enabled_barcode: DF.Check
		write_off_account: DF.Link | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books POS Settings"

	def validate(self):
		validate_changed_accounts(self, ACCOUNT_TYPES)
		self.validate_weight_barcode()

	def validate_weight_barcode(self):
		"""A scale barcode holds the prefix, an item code and a weight."""
		if not self.weight_enabled_barcode:
			return
		if not (self.item_code_digits and self.item_weight_digits):
			frappe.throw(_("A weighted barcode needs Item Code Digits and Item Weight Digits."))
		prefix_digits = len(str(self.check_digits)) if self.check_digits else 0
		if prefix_digits + self.item_code_digits + self.item_weight_digits > MAX_BARCODE_DIGITS:
			frappe.throw(_("A weighted barcode has at most {0} digits.").format(MAX_BARCODE_DIGITS))
