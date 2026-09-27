# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _

from frappe_books.accounting.invoice import PostingInvoiceController
from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.accounting.payment import map_invoice_payment
from frappe_books.accounting.returns import map_return
from frappe_books.commerce import pricing
from frappe_books.commerce.pos import open_shift_name


class BooksSalesInvoice(PostingInvoiceController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_applied_coupon_codes.books_applied_coupon_codes import (
			BooksAppliedCouponCodes,
		)
		from frappe_books.frappe_books.doctype.books_pricing_rule_detail.books_pricing_rule_detail import (
			BooksPricingRuleDetail,
		)
		from frappe_books.frappe_books.doctype.books_sales_invoice_item.books_sales_invoice_item import (
			BooksSalesInvoiceItem,
		)
		from frappe_books.frappe_books.doctype.books_tax_summary.books_tax_summary import (
			BooksTaxSummary,
		)

		account: DF.Link
		amended_from: DF.Link | None
		attachment: DF.Attach | None
		available_loyalty_points: DF.Int
		back_reference: DF.Link | None
		base_grand_total: DF.Currency
		coupons: DF.Table[BooksAppliedCouponCodes]
		currency: DF.Link | None
		date: DF.Datetime
		discount_after_tax: DF.Check
		discount_amount: DF.Currency
		discount_percent: DF.Float
		entry_currency: DF.Literal["Party", "Company"]
		exchange_rate: DF.Float
		grand_total: DF.Currency
		is_fully_returned: DF.Check
		is_pos: DF.Check
		is_pricing_rule_applied: DF.Check
		is_returned: DF.Check
		items: DF.Table[BooksSalesInvoiceItem]
		loyalty_points: DF.Int
		loyalty_program: DF.Link | None
		make_auto_payment: DF.Check
		make_auto_stock_transfer: DF.Check
		net_total: DF.Currency
		number_series: DF.Link
		outstanding_amount: DF.Currency
		party: DF.Link
		price_list: DF.Link | None
		pricing_rule_detail: DF.Table[BooksPricingRuleDetail]
		quote: DF.Link | None
		redeem_loyalty_points: DF.Check
		return_against: DF.Link | None
		set_discount_amount: DF.Check
		status: DF.Literal["Saved", "Unpaid", "PartlyPaid", "Paid", "Return", "ReturnIssued", "Cancelled"]
		stock_not_transferred: DF.Float
		taxes: DF.Table[BooksTaxSummary]
		terms: DF.Text | None
	# end: auto-generated types

	transaction_type = "sales"

	def validate(self):
		super().validate()
		if self.is_pos and not self.return_against:
			self.validate_pos_permissions()

	def before_submit(self):
		super().before_submit()
		if self.is_pos and not self.return_against and not open_shift_name():
			frappe.throw(_("Open a POS shift before submitting a POS invoice."))

	def validate_pos_permissions(self):
		"""Hold POS rows to the rates and discounts the POS profile allows."""
		rows = [row for row in self.items if not row.is_free_item]
		rules = pricing.applied_rules(rows)
		if not pricing.pos_setting("can_change_rate"):
			self._validate_pos_rates(rows, rules)
		if not pricing.pos_setting("can_edit_discount"):
			self._validate_pos_discounts(rows, rules)

	def _validate_pos_rates(self, rows, rules):
		rates = pricing.standard_rates(self)
		for row in rows:
			rate = pricing.standard_rate(self, row, rates)
			# Rows without a standard rate, or priced by a rule, keep the rate they have.
			if rate is None or _price_type(rules, row) == "rate":
				continue
			if rounded(row.rate, self.currency) != rate:
				frappe.throw(_("The POS profile does not allow changing the rate of {0}.").format(row.item))

	def _validate_pos_discounts(self, rows, rules):
		for row in rows:
			if _price_type(rules, row) in ("percentage", "amount"):
				continue
			if as_decimal(row.item_discount_percent) or as_decimal(row.item_discount_amount):
				frappe.throw(
					_("The POS profile does not allow editing the discount of {0}.").format(row.item)
				)


def _price_type(rules, row):
	rule = rules.get(row.pricing_rule)
	return rule.price_discount_type if rule and rule.discount_type == "Price Discount" else None


@frappe.whitelist()
def make_payment(source_name: str):
	return map_invoice_payment("Books Sales Invoice", source_name)


@frappe.whitelist()
def make_return(source_name: str):
	return map_return("Books Sales Invoice", source_name)
