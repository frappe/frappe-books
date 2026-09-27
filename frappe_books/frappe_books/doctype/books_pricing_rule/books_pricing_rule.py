# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.accounting.money import as_decimal
from frappe_books.commerce.pricing import validate_dates, validate_range
from frappe_books.series import SeriesNamingMixin


class BooksPricingRule(SeriesNamingMixin, Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_pricing_rule_item.books_pricing_rule_item import (
			BooksPricingRuleItem,
		)

		applied_items: DF.Table[BooksPricingRuleItem]
		discount_amount: DF.Currency
		discount_percentage: DF.Float
		discount_rate: DF.Currency
		discount_type: DF.Literal["Price Discount", "Product Discount"]
		free_item: DF.Link | None
		free_item_quantity: DF.Float
		free_item_unit: DF.Link | None
		is_coupon_code_based: DF.Check
		is_enabled: DF.Check
		is_recursive: DF.Check
		max_amount: DF.Currency
		max_quantity: DF.Float
		min_amount: DF.Currency
		min_quantity: DF.Float
		number_series: DF.Link
		price_discount_type: DF.Literal["rate", "percentage", "amount"]
		priority: DF.Literal[
			"1",
			"2",
			"3",
			"4",
			"5",
			"6",
			"7",
			"8",
			"9",
			"10",
			"11",
			"12",
			"13",
			"14",
			"15",
			"16",
			"17",
			"18",
			"19",
			"20",
		]
		recurse_every: DF.Float
		round_free_item_qty: DF.Check
		rounding_method: DF.Literal["floor", "round", "ceil"]
		title: DF.Data
		valid_from: DF.Date | None
		valid_to: DF.Date | None
	# end: auto-generated types

	def validate(self):
		validate_range(self.min_quantity, self.max_quantity, _("quantity"))
		validate_range(self.min_amount, self.max_amount, _("amount"), strict=True)
		validate_dates(self.valid_from, self.valid_to)
		if not self.applied_items:
			frappe.throw(_("Add at least one item to the pricing rule."))
		if self.discount_type == "Price Discount":
			self.validate_price_discount()
		elif self.discount_type == "Product Discount":
			self.validate_product_discount()

	def validate_price_discount(self):
		value_by_type = {
			"rate": self.discount_rate,
			"percentage": self.discount_percentage,
			"amount": self.discount_amount,
		}
		if self.price_discount_type not in value_by_type:
			frappe.throw(_("Select a price discount type."))
		value = as_decimal(value_by_type[self.price_discount_type])
		if value < 0:
			frappe.throw(_("Discount values cannot be negative."))
		if self.price_discount_type == "percentage" and value > 100:
			frappe.throw(_("Discount percentage cannot exceed 100."))

	def validate_product_discount(self):
		if not self.free_item or as_decimal(self.free_item_quantity) <= 0:
			frappe.throw(_("A product discount requires a free item and a positive quantity."))
		if self.is_recursive and as_decimal(self.recurse_every) <= 0:
			frappe.throw(_("Recursive product discounts require a positive recurse-every quantity."))
