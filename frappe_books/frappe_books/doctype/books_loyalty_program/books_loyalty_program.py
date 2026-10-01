# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate

from frappe_books.accounting.money import as_decimal
from frappe_books.commerce.loyalty import program_status
from frappe_books.settings import require_feature


class BooksLoyaltyProgram(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_collection_rules_items.books_collection_rules_items import (
			BooksCollectionRulesItems,
		)

		collection_rules: DF.Table[BooksCollectionRulesItems]
		conversion_factor: DF.Float
		expense_account: DF.Link
		expiry_duration: DF.Int
		from_date: DF.Date
		is_enabled: DF.Check
		maximum_use: DF.Int
		status: DF.Literal["Active", "Disabled", "Expired", "Maxed"]
		to_date: DF.Date
		used: DF.Int
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Loyalty Program"

	def validate(self):
		require_feature("enable_loyalty_program")
		if getdate(self.from_date) > getdate(self.to_date):
			frappe.throw(_("Loyalty program start date must be on or before its end date."))
		# The messages /books shows at these fields.
		if self.used < 0:
			frappe.throw(_("Used count cannot be negative"))
		if self.maximum_use < 0:
			frappe.throw(_("Maximum use cannot be negative"))
		if self.maximum_use and self.used > self.maximum_use:
			frappe.throw(_("Used count cannot exceed maximum use limit"))
		if as_decimal(self.conversion_factor) < 0:
			frappe.throw(_("Loyalty conversion factor cannot be negative."))
		self.validate_tiers()
		self.status = program_status(self)

	def validate_tiers(self):
		minimums = [as_decimal(row.minimum_total_spent) for row in self.collection_rules]
		if len(minimums) != len(set(minimums)):
			frappe.throw(_("Each loyalty tier must have a unique minimum spend."))
		for row in self.collection_rules:
			if as_decimal(row.collection_factor) < 0 or as_decimal(row.minimum_total_spent) < 0:
				frappe.throw(_("Loyalty tier values cannot be negative."))
