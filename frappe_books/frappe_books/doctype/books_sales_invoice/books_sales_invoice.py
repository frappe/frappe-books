# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import now_datetime

from frappe_books.accounting.invoice import PostingInvoiceController
from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.accounting.payment import map_invoice_payment
from frappe_books.accounting.returns import map_return
from frappe_books.commerce import pricing
from frappe_books.commerce.pos import counter_payment_account, counter_payment_amounts, open_shift_name
from frappe_books.inventory.auto_transfer import map_invoice_transfer


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
		from frappe_books.frappe_books.doctype.books_sales_invoice_payment.books_sales_invoice_payment import (
			BooksSalesInvoicePayment,
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
		payments: DF.Table[BooksSalesInvoicePayment]
		price_list: DF.Link | None
		pricing_rule_detail: DF.Table[BooksPricingRuleDetail]
		quote: DF.Link | None
		redeem_loyalty_points: DF.Check
		return_against: DF.Link | None
		set_discount_amount: DF.Check
		status: DF.Literal["Saved", "Unpaid", "Partly Paid", "Paid", "Return", "Return Issued", "Cancelled"]
		stock_not_transferred: DF.Float
		taxes: DF.Table[BooksTaxSummary]
		terms: DF.Text | None
	# end: auto-generated types

	transaction_type = "sales"

	def before_validate(self):
		if self.is_pos and self._action == "submit":
			# A POS sale is dated when it is checked out.
			self.date = now_datetime()
		super().before_validate()

	def validate(self):
		super().validate()
		if self.is_pos:
			# Ship in the submit transaction, so a stock error also rejects the sale.
			self.make_auto_stock_transfer = 1
		if self.is_pos and not self.return_against:
			self.validate_pos_permissions()
		self.validate_payments()

	def validate_payments(self):
		if self.payments and not self.is_pos:
			frappe.throw(_("Only POS invoices take counter payments."))
		counter_payment_amounts(self.payments, abs(as_decimal(self.outstanding_amount)))

	def before_submit(self):
		super().before_submit()
		if self.is_pos and not self.return_against and not open_shift_name():
			frappe.throw(_("Open a POS shift before submitting a POS invoice."))

	def on_submit(self):
		super().on_submit()
		self.pay_at_counter(self.payments)

	def pay_at_counter(self, rows):
		"""Submit a payment for each tendered row and return their names."""
		due = abs(as_decimal(self.outstanding_amount))
		names = [self.make_counter_payment(row, amount) for row, amount in counter_payment_amounts(rows, due)]
		self.outstanding_amount = self.db_get("outstanding_amount")
		return names

	def make_counter_payment(self, row, amount):
		payment = map_invoice_payment(self.doctype, self.name)
		payment.update(
			{
				"payment_method": row.payment_method,
				"payment_account": counter_payment_account(row.payment_method),
				"amount": amount,
				"reference_id": row.reference_id,
				"clearance_date": row.clearance_date,
			}
		)
		payment.payment_references[0].amount = amount
		payment.insert()
		payment.submit()
		return payment.name

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


@frappe.whitelist(methods=["POST"])
def pay_pos_invoice(invoice: str, payments: list[dict]) -> list[str]:
	"""Pay a submitted POS invoice at the counter and return the payment names."""
	doc = frappe.get_doc("Books Sales Invoice", invoice, for_update=True)
	doc.check_permission("read")
	if not (doc.is_pos and doc.docstatus == 1):
		frappe.throw(_("Only submitted POS invoices can be paid at the counter."))
	return doc.pay_at_counter([frappe._dict(row) for row in payments])


@frappe.whitelist()
def make_payment(source_name: str):
	return map_invoice_payment("Books Sales Invoice", source_name)


@frappe.whitelist()
def make_return(source_name: str):
	return map_return("Books Sales Invoice", source_name)


@frappe.whitelist()
def make_shipment(source_name: str):
	return map_invoice_transfer("Books Sales Invoice", source_name)
