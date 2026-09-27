# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class BooksLoyaltyPointEntry(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		customer: DF.Link
		expiry_date: DF.Date | None
		invoice: DF.Link
		loyalty_points: DF.Int
		loyalty_program: DF.Link
		loyalty_program_tier: DF.Data | None
		posting_date: DF.Date | None
		purchase_amount: DF.Currency
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Loyalty Point Entry"
