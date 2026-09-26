# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document

from frappe_books.regional import validate_gstin


class BooksAccountingSettings(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		bank_name: DF.Data
		company_name: DF.Data
		country: DF.Autocomplete
		discount_account: DF.Link | None
		email: DF.Data
		enable_coupon_code: DF.Check
		enable_discounting: DF.Check
		enable_form_customization: DF.Check
		enable_inventory: DF.Check
		enable_invoice_returns: DF.Check
		enable_item_enquiry: DF.Check
		enable_lead: DF.Check
		enable_loyalty_program: DF.Check
		enable_partial_payment: DF.Check
		enable_point_of_sale_with_out_inventory: DF.Check
		enable_price_list: DF.Check
		enable_pricing_rule: DF.Check
		enableitem_group: DF.Check
		fiscal_year_end: DF.Date
		fiscal_year_start: DF.Date
		fullname: DF.Data
		gstin: DF.Data | None
		round_off_account: DF.Link | None
		setup_complete: DF.Check
		tax_id: DF.Data | None
		write_off_account: DF.Link | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Accounting Settings"

	def validate(self):
		if self.country == "India" and self.gstin:
			self.gstin = validate_gstin(self.gstin)
