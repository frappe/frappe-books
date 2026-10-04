# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import now_datetime

from frappe_books.accounting import settlement
from frappe_books.accounting.invoice import PostingInvoiceController
from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.accounting.payment import map_invoice_payment, validate_payment_details
from frappe_books.accounting.returns import map_return
from frappe_books.commerce import loyalty, pricing
from frappe_books.commerce.pos import counter_payment_account, counter_payment_amounts, open_shift_name
from frappe_books.inventory.availability import validate_pos_stock
from frappe_books.inventory.invoice_transfer import default_location, map_invoice_transfer
from frappe_books.inventory.stock import fill_serial_numbers


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
		exchange_rate: DF.Float
		grand_total: DF.Currency
		is_fully_returned: DF.Check
		is_pos: DF.Check
		is_pricing_rule_applied: DF.Check
		is_returned: DF.Check
		items: DF.Table[BooksSalesInvoiceItem]
		loyalty_points: DF.Int
		loyalty_points_amount: DF.Currency
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
		status: DF.Literal["Saved", "Unpaid", "Partly Paid", "Paid", "Return", "Return Issued", "Cancelled"]
		stock_not_transferred: DF.Float
		taxes: DF.Table[BooksTaxSummary]
		terms: DF.Text | None
		total_discount: DF.Currency
	# end: auto-generated types

	transaction_type = "sales"
	is_purchase = False
	party_account_type = "Receivable"
	item_account_field = "income_account"

	@property
	def loyalty_points_amount(self):
		"""What the redeemed points take off the grand total, as a virtual field."""
		return loyalty.redemption_amount(self)

	def calculate(self, drop_invalid_coupons=False):
		"""Also show the points the party can redeem."""
		super().calculate(drop_invalid_coupons)
		loyalty.set_available_points(self)

	def set_prices(self, drop_invalid_coupons=False):
		"""Apply pricing rules and coupons too; a return keeps its original's prices."""
		if self.return_against:
			super().set_prices()
		else:
			pricing.price(self, drop_invalid_coupons)

	def populate_party_defaults(self):
		"""Also join the party's loyalty program; a return keeps its original's."""
		party = super().populate_party_defaults()
		if party and not self.return_against:
			self.loyalty_program = party.loyalty_program
		return party

	def deduct_redemption(self, total):
		"""A return gives back its share of the points its original redeemed."""
		if self.return_against:
			loyalty.set_return_redemption(self, total)
		return total - loyalty.redemption_amount(self)

	def get_ledger_posting(self):
		"""Also expense the redeemed loyalty points, on the party's side."""
		posting = super().get_ledger_posting()
		redeemed = loyalty.redemption_amount(self)
		if redeemed:
			posting.on_party_side(loyalty.loyalty_expense_account(self), redeemed)
		return posting

	@frappe.whitelist()
	def preview(self, check_coupons: bool = False):
		"""Also give a POS sale's serialised rows serial numbers in stock where it ships from."""
		super().preview(check_coupons)
		if self.is_pos and not self.return_against:
			fill_serial_numbers(self.items, default_location(self))

	def before_validate(self):
		if self.is_pos and self._action == "submit":
			# A POS sale is dated when it is checked out.
			self.date = now_datetime()
		super().before_validate()

	def validate(self):
		super().validate()
		loyalty.validate_invoice_loyalty(self)
		if self.is_pos:
			# Ship in the submit transaction, so a stock error also rejects the sale.
			self.make_auto_stock_transfer = 1
		if self.is_held_to_pos_limits():
			self.validate_pos_permissions()
		self.validate_payments()

	def is_held_to_pos_limits(self):
		"""POS sales keep the POS rates and discounts; with POS on, so do all sales of users who cannot change them."""
		if self.return_against:
			return False
		if self.is_pos:
			return True
		pos_enabled = frappe.db.get_single_value("Books Inventory Settings", "enable_point_of_sale")
		return bool(pos_enabled) and not frappe.has_permission("Books Pos Settings", "write")

	def validate_payments(self):
		if self.payments and not self.is_pos:
			frappe.throw(_("Only POS invoices take counter payments."))
		for row in self.payments:
			validate_payment_details(row.payment_method, row.reference_id, row.clearance_date)
		counter_payment_amounts(self.payments, settlement.due(self))

	def before_submit(self):
		super().before_submit()
		if self.is_pos and not self.return_against:
			if not open_shift_name():
				frappe.throw(_("Open a POS shift before submitting a POS invoice."))
			validate_pos_stock(self.items)

	def on_submit(self):
		super().on_submit()
		self.update_coupon_usage(1)
		loyalty.process_invoice(self)
		self.pay_at_counter(self.payments)

	def on_cancel(self):
		super().on_cancel()
		self.update_coupon_usage(-1)
		loyalty.reverse_invoice(self)

	def update_coupon_usage(self, delta):
		"""Count the coupons as used, or unused on cancel; a return uses none."""
		if not self.return_against:
			pricing.update_coupon_usage(self, delta)

	def pay_at_counter(self, rows):
		"""Submit a payment for each tendered row and return their names."""
		amounts = counter_payment_amounts(rows, settlement.due(self))
		names = [self.make_counter_payment(row, amount) for row, amount in amounts]
		settlement.reload_balance(self)
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
		"""Hold the rows to the rates and discounts the POS profile allows."""
		rows = [row for row in self.items if not row.is_free_item]
		if not pricing.pos_setting("can_change_rate"):
			self._validate_pos_rates(rows)
		if not pricing.pos_setting("can_edit_discount"):
			self._validate_pos_discounts(rows)

	def _validate_pos_rates(self, rows):
		rates = pricing.standard_rates(self)
		for row in rows:
			rate = pricing.standard_rate(self, row, rates)
			# Rows without a standard rate, or priced by a rule, keep the rate they have.
			if rate is None or pricing.is_rule_priced(row, "rate"):
				continue
			if rounded(row.rate, self.currency) != rate:
				frappe.throw(_("The POS profile does not allow changing the rate of {0}.").format(row.item))

	def _validate_pos_discounts(self, rows):
		for row in rows:
			if pricing.is_rule_priced(row, "discount"):
				continue
			if as_decimal(row.item_discount_percent) or as_decimal(row.item_discount_amount):
				frappe.throw(
					_("The POS profile does not allow editing the discount of {0}.").format(row.item)
				)


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
