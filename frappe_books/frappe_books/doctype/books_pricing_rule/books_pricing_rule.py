# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _, _lt
from frappe.model.document import Document

from frappe_books.accounting.money import as_decimal
from frappe_books.commerce.pricing import validate_dates, validate_range
from frappe_books.inventory.units import item_units
from frappe_books.permissions import check_preview_permission
from frappe_books.series import SeriesNamingMixin

# What /books says at each limit when it crosses the other limit of its pair.
LIMIT_MESSAGES = {
	"min_qty": _lt("Minimum Quantity should be less than the Maximum Quantity."),
	"max_qty": _lt("Maximum Quantity should be greater than the Minimum Quantity."),
	"min_amt": _lt("Minimum Amount should be less than the Maximum Amount."),
	"max_amt": _lt("Maximum Amount should be greater than the Minimum Amount."),
	"valid_from": _lt("Valid From Date should be less than Valid To Date."),
	"valid_upto": _lt("Valid To Date should be greater than Valid From Date."),
}


class BooksPricingRule(SeriesNamingMixin, Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_pricing_rule_item_code.books_pricing_rule_item_code import (
			BooksPricingRuleItemCode,
		)

		company: DF.Link | None
		coupon_code_based: DF.Check
		disable: DF.Check
		discount_amount: DF.Currency
		discount_percentage: DF.Float
		free_item: DF.Link | None
		free_item_uom: DF.Link | None
		free_qty: DF.Float
		is_recursive: DF.Check
		items: DF.Table[BooksPricingRuleItemCode]
		max_amt: DF.Currency
		max_qty: DF.Float
		min_amt: DF.Currency
		min_qty: DF.Float
		naming_series: DF.Link
		price_or_product_discount: DF.Literal["Price", "Product"]
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
		rate: DF.Currency
		rate_or_discount: DF.Literal["Rate", "Discount Percentage", "Discount Amount"]
		recurse_for: DF.Float
		round_free_qty: DF.Check
		rounding_method: DF.Literal["floor", "round", "ceil"]
		title: DF.Data
		valid_from: DF.Date | None
		valid_upto: DF.Date | None
	# end: auto-generated types

	@frappe.whitelist()
	def preview(self):
		"""Fill each applied item's unit from its item, as a save would, for the form to show it."""
		check_preview_permission(self)
		for row in self.items:
			row.get_invalid_links()

	def validate(self):
		validate_range(
			self.min_qty,
			self.max_qty,
			_("quantity"),
			message=self.get_limit_message("min_qty", "max_qty"),
		)
		validate_range(
			self.min_amt,
			self.max_amt,
			_("amount"),
			strict=True,
			message=self.get_limit_message("min_amt", "max_amt"),
		)
		validate_dates(self.valid_from, self.valid_upto, self.get_limit_message("valid_from", "valid_upto"))
		if not self.items:
			frappe.throw(_("Add at least one item to the pricing rule."))
		if self.price_or_product_discount == "Price":
			self.validate_price_discount()
		elif self.price_or_product_discount == "Product":
			self.validate_product_discount()
		self.validate_units()

	def get_limit_message(self, lower, upper):
		"""The message /books shows at the edited limit: the upper one's when only it changed."""
		is_upper_edit = self.has_value_changed(upper) and not self.has_value_changed(lower)
		return str(LIMIT_MESSAGES[upper if is_upper_edit else lower])

	def validate_price_discount(self):
		value_by_type = {
			"Rate": self.rate,
			"Discount Percentage": self.discount_percentage,
			"Discount Amount": self.discount_amount,
		}
		if self.rate_or_discount not in value_by_type:
			frappe.throw(_("Select a price discount type."))
		value = as_decimal(value_by_type[self.rate_or_discount])
		if value < 0:
			frappe.throw(_("Discount values cannot be negative."))
		if self.rate_or_discount == "Discount Percentage" and value > 100:
			frappe.throw(_("Discount percentage cannot exceed 100."))

	def validate_product_discount(self):
		if not self.free_item or as_decimal(self.free_qty) <= 0:
			frappe.throw(_("A product discount requires a free item and a positive quantity."))
		if self.is_recursive and as_decimal(self.recurse_for) <= 0:
			frappe.throw(_("Recursive product discounts require a positive recurse-every quantity."))

	def validate_units(self):
		"""The rule matches rows in its items' units and gives the free row in its unit, so the items must have them."""
		item_unit_pairs = [(row.item_code, row.uom) for row in self.items if row.uom]
		if self.price_or_product_discount == "Product" and self.free_item_uom:
			item_unit_pairs.append((self.free_item, self.free_item_uom))
		units = item_units({item for item, _unit in item_unit_pairs})
		for item, unit in item_unit_pairs:
			stock_unit, factors = units[item]
			if unit not in (stock_unit, *factors):
				frappe.throw(_("UOM {0} is not applicable for Item {1}.").format(unit, item))
