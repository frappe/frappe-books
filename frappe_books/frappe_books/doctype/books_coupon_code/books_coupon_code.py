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

		coupon_name: DF.Data
		is_enabled: DF.Check
		max_amount: DF.Currency
		maximum_use: DF.Int
		min_amount: DF.Currency
		pricing_rule: DF.Link
		used: DF.Int
		valid_from: DF.Date
		valid_to: DF.Date
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Coupon Code"

	def autoname(self):
		code = re.sub(r"\s+", "", self.coupon_name or "").upper()[:8]
		if not code:
			frappe.throw("Coupon Name must contain at least one non-space character.")
		self.name = code

	def validate(self):
		require_feature("enable_coupon_code")
		validate_range(self.min_amount, self.max_amount, _("amount"), strict=True)
		validate_dates(self.valid_from, self.valid_to)
		if self.maximum_use < 0 or self.used < 0:
			frappe.throw(_("Coupon usage counts cannot be negative."))
		if self.maximum_use and self.used > self.maximum_use:
			frappe.throw(_("Coupon usage cannot exceed its maximum use limit."))
		self.validate_against_rule(frappe.get_doc("Books Pricing Rule", self.pricing_rule))

	def validate_against_rule(self, rule):
		if not rule.is_coupon_code_based:
			frappe.throw(_("Coupon codes can only use coupon-based pricing rules."))
		if as_decimal(rule.min_amount) and as_decimal(self.min_amount) < as_decimal(rule.min_amount):
			frappe.throw(_("Coupon minimum amount cannot be below the pricing-rule minimum."))
		if as_decimal(rule.max_amount) and as_decimal(self.max_amount) > as_decimal(rule.max_amount):
			frappe.throw(_("Coupon maximum amount cannot exceed the pricing-rule maximum."))
		if rule.valid_from and getdate(self.valid_from) < getdate(rule.valid_from):
			frappe.throw(_("Coupon validity cannot start before its pricing rule."))
		if rule.valid_to and getdate(self.valid_to) > getdate(rule.valid_to):
			frappe.throw(_("Coupon validity cannot end after its pricing rule."))
