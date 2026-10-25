# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from frappe_books.accounting.accounts import validate_changed_accounts

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
		pos_ui: DF.Literal["Classic", "Modern"]
		warehouse: DF.Link | None
		weight_enabled_barcode: DF.Check
		write_off_account: DF.Link | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books POS Settings"

	def validate(self):
		validate_changed_accounts(self, ACCOUNT_TYPES)
