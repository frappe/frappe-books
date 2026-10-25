# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate

from frappe_books.accounting.money import as_decimal
from frappe_books.commerce.pricing import validate_dates, validate_range
from frappe_books.settings import require_feature


class BooksCouponCode(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		coupon_code: DF.Data | None
		coupon_name: DF.Data
		coupon_type: DF.Literal["Promotional", "Gift Card"]
		is_enabled: DF.Check
		max_amt: DF.Currency
		maximum_use: DF.Int
		min_amt: DF.Currency
		pricing_rule: DF.Link
		used: DF.Int
		valid_from: DF.Date
		valid_upto: DF.Date
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Coupon Code"

	def validate(self):
		require_feature("enable_coupon_code")
		self.set_coupon_code()
		validate_range(self.min_amt, self.max_amt, _("amount"), strict=True)
		validate_dates(self.valid_from, self.valid_upto)
		if self.maximum_use < 0 or self.used < 0:
			frappe.throw(_("Coupon usage counts cannot be negative."))
		if self.maximum_use and self.used > self.maximum_use:
			frappe.throw(_("Coupon usage cannot exceed its maximum use limit."))
		self.validate_against_rule(frappe.get_doc("Books Pricing Rule", self.pricing_rule))

	def set_coupon_code(self):
		"""A coupon without a code gets the code Books makes from its name: no spaces, upper case, 8 letters."""
		if self.coupon_code:
			return
		self.coupon_code = re.sub(r"\s+", "", self.coupon_name or "").upper()[:8]
		if not self.coupon_code:
			frappe.throw(_("Coupon Name must contain at least one non-space character."))

	def validate_against_rule(self, rule):
		if not rule.coupon_code_based:
			frappe.throw(_("Coupon codes can only use coupon-based pricing rules."))
		if as_decimal(rule.min_amt) and as_decimal(self.min_amt) < as_decimal(rule.min_amt):
			frappe.throw(_("Coupon minimum amount cannot be below the pricing-rule minimum."))
		if as_decimal(rule.max_amt) and as_decimal(self.max_amt) > as_decimal(rule.max_amt):
			frappe.throw(_("Coupon maximum amount cannot exceed the pricing-rule maximum."))
		if rule.valid_from and getdate(self.valid_from) < getdate(rule.valid_from):
			frappe.throw(_("Coupon validity cannot start before its pricing rule."))
		if rule.valid_upto and getdate(self.valid_upto) > getdate(rule.valid_upto):
			frappe.throw(_("Coupon validity cannot end after its pricing rule."))
