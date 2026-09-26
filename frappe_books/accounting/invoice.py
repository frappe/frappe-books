"""Invoice calculations, validation, posting, and cancellation behavior."""

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.accounting import returns
from frappe_books.accounting.ledger import LedgerPosting, delete_entries, reverse_entries
from frappe_books.accounting.money import as_decimal, rounded, sum_decimal
from frappe_books.accounting.outstanding import update_party_outstanding
from frappe_books.accounting.payment import map_invoice_payment
from frappe_books.commerce import loyalty, pricing
from frappe_books.inventory.auto_transfer import cancel_auto_transfer, create_auto_transfer
from frappe_books.series import SeriesNamingMixin


class InvoiceController(SeriesNamingMixin, Document):
	"""Totals and validation shared by quotes and invoices."""

	transaction_type: str

	def before_validate(self):
		self.calculate()

	def calculate(self):
		"""Fill defaults, apply pricing and set the totals, without writing anything."""
		pricing.reset_pricing(self)
		_populate_invoice_defaults(self)
		pricing.apply_pricing(self)
		_populate_invoice_defaults(self)
		calculate_invoice(self)
		loyalty.set_available_points(self)

	def validate(self):
		validate_invoice(self)
		loyalty.validate_invoice_loyalty(self)


class PostingInvoiceController(InvoiceController):
	"""Ledger, outstanding and follow-up effects of submitting an invoice."""

	def before_submit(self):
		outstanding = abs(as_decimal(self.base_grand_total))
		self.outstanding_amount = -outstanding if self.return_against else outstanding

	def on_submit(self):
		post_invoice(self)
		update_party_outstanding(self.party)
		pricing.update_coupon_usage(self, 1)
		loyalty.process_invoice(self)
		create_auto_transfer(self)
		if self.return_against:
			returns.update_return_status(self, include_current=True)
		# POS invoices are paid at the counter with the tendered payment method.
		if self.make_auto_payment and self.outstanding_amount and not self.get("is_pos"):
			self.pay_outstanding_amount()

	def pay_outstanding_amount(self):
		payment = map_invoice_payment(self.doctype, self.name)
		payment.insert()
		payment.submit()
		self.outstanding_amount = self.db_get("outstanding_amount")

	def before_cancel(self):
		cancel_auto_transfer(self)
		self.outstanding_amount = 0

	def on_cancel(self):
		reverse_entries(self)
		update_party_outstanding(self.party)
		pricing.update_coupon_usage(self, -1)
		loyalty.reverse_invoice(self)
		if self.return_against:
			returns.update_return_status(self, include_current=False)

	def on_trash(self):
		delete_entries(self)


def calculate_invoice(invoice):
	taxes = {}
	for row in invoice.items:
		_calculate_row(invoice, row, taxes)
	invoice.set("taxes", list(taxes.values()))
	_calculate_totals(invoice)


def _calculate_row(invoice, row, taxes):
	currency = invoice.get("currency")
	row.amount = rounded(as_decimal(row.rate) * as_decimal(row.quantity), currency)
	discount = _item_discount(row, row.amount, currency)
	tax_base = row.amount if invoice.discount_after_tax else row.amount - discount
	row_tax = _add_row_taxes(row, tax_base, taxes, currency)
	if invoice.discount_after_tax:
		row.item_taxed_total = row.amount + row_tax
		row.item_discounted_total = row.item_taxed_total - _item_discount(row, row.item_taxed_total, currency)
	else:
		row.item_discounted_total = row.amount - discount
		row.item_taxed_total = row.item_discounted_total + row_tax


def _add_row_taxes(row, base, taxes, currency):
	row_tax = as_decimal(0)
	for detail in _tax_details(row.tax):
		amount = rounded(base * as_decimal(detail.rate) / 100, currency)
		tax = taxes.setdefault(
			detail.account, {"account": detail.account, "rate": detail.rate, "amount": as_decimal(0)}
		)
		tax["amount"] += amount
		row_tax += amount
	return row_tax


def _calculate_totals(invoice):
	currency = invoice.get("currency")
	invoice.net_total = sum_decimal(row.amount for row in invoice.items)
	item_discount = sum_decimal(row_discount(invoice, row) for row in invoice.items)
	taxed_total = sum_decimal(row.item_taxed_total for row in invoice.items)
	invoice.discount_amount = _invoice_discount(
		invoice, taxed_total, invoice.net_total - item_discount, currency
	)
	grand_total = (
		invoice.net_total
		+ sum_decimal(tax.amount for tax in invoice.taxes)
		- item_discount
		- invoice.discount_amount
	)
	if invoice.transaction_type == "sales":
		grand_total -= loyalty.redemption_amount(invoice)
	invoice.grand_total = rounded(grand_total, currency)
	invoice.base_grand_total = rounded(invoice.grand_total * as_decimal(invoice.exchange_rate or 1))
	if invoice.docstatus == 0:
		invoice.outstanding_amount = abs(invoice.base_grand_total)


def row_discount(invoice, row):
	"""Return the item discount of a calculated row, signed like its amount."""
	undiscounted = row.item_taxed_total if invoice.discount_after_tax else row.amount
	return as_decimal(undiscounted) - as_decimal(row.item_discounted_total)


def validate_invoice(invoice):
	if not invoice.items:
		frappe.throw(_("At least one invoice item is required."))
	if invoice.exchange_rate is not None and as_decimal(invoice.exchange_rate) <= 0:
		frappe.throw(_("Exchange rate must be greater than zero."))
	for row in invoice.items:
		_validate_row(invoice, row)
	if invoice.get("return_against"):
		returns.validate_return(invoice)


def _validate_row(invoice, row):
	if not row.item:
		frappe.throw(_("Every invoice row requires an item."))
	quantity = as_decimal(row.quantity)
	if quantity == 0:
		frappe.throw(_("Item quantity cannot be zero."))
	if quantity < 0 and not invoice.get("return_against"):
		frappe.throw(_("Negative quantities require a return-against invoice."))
	if as_decimal(row.rate) < 0:
		frappe.throw(_("Item rate cannot be negative."))


def post_invoice(invoice):
	posting = LedgerPosting(invoice)
	total = abs(as_decimal(invoice.base_grand_total))
	exchange_rate = as_decimal(invoice.exchange_rate or 1)
	is_return = bool(invoice.get("return_against"))

	if invoice.transaction_type == "sales":
		_post_sales(invoice, posting, total, exchange_rate, is_return)
	else:
		_post_purchase(invoice, posting, total, exchange_rate, is_return)
	posting.post()


def _post_sales(invoice, posting, total, exchange_rate, is_return):
	_post_direction(posting, invoice.account, total, invoice.party, reverse=is_return)
	loyalty_amount = loyalty.redemption_amount(invoice) * exchange_rate
	if loyalty_amount:
		_post_direction(
			posting,
			loyalty.loyalty_expense_account(invoice),
			loyalty_amount,
			reverse=is_return,
		)
	for row in invoice.items:
		_post_direction(
			posting, row.account, abs(as_decimal(row.amount) * exchange_rate), credit=True, reverse=is_return
		)
	for tax in invoice.taxes:
		_post_direction(
			posting, tax.account, abs(as_decimal(tax.amount) * exchange_rate), credit=True, reverse=is_return
		)
	_post_discount(invoice, posting, exchange_rate, credit=False, reverse=is_return)


def _post_purchase(invoice, posting, total, exchange_rate, is_return):
	_post_direction(posting, invoice.account, total, invoice.party, credit=True, reverse=is_return)
	for row in invoice.items:
		_post_direction(posting, row.account, abs(as_decimal(row.amount) * exchange_rate), reverse=is_return)
	for tax in invoice.taxes:
		_post_direction(posting, tax.account, abs(as_decimal(tax.amount) * exchange_rate), reverse=is_return)
	_post_discount(invoice, posting, exchange_rate, credit=True, reverse=is_return)


def _post_discount(invoice, posting, exchange_rate, credit, reverse):
	item_discount = sum_decimal(row_discount(invoice, row) for row in invoice.items)
	discount = (abs(item_discount) + abs(as_decimal(invoice.discount_amount))) * exchange_rate
	if discount == 0:
		return
	account = frappe.db.get_single_value("Books Accounting Settings", "discount_account")
	if not account:
		frappe.throw(_("Set a discount account in Books Accounting Settings."))
	_post_direction(posting, account, discount, credit=credit, reverse=reverse)


def _post_direction(posting, account, amount, party=None, credit=False, reverse=False):
	if credit ^ reverse:
		posting.credit(account, amount, party)
	else:
		posting.debit(account, amount, party)


def _populate_invoice_defaults(invoice):
	if invoice.transaction_type != "quote" and invoice.party and not invoice.get("account"):
		invoice.account = frappe.db.get_value("Books Party", invoice.party, "default_account")
	items = _item_details({row.item for row in invoice.get("items", []) if row.item})
	rates = pricing.standard_rates(invoice) if items else {}
	for row in invoice.get("items", []):
		if row.item in items:
			_populate_row(invoice, row, items[row.item], rates)


def _populate_row(invoice, row, item, rates):
	for fieldname in ("item_code", "description", "unit", "tax"):
		if not row.get(fieldname):
			row.set(fieldname, item.get(fieldname))
	row.transfer_unit = row.transfer_unit or row.unit
	if not row.rate and not (row.is_manual_rate or row.get("is_free_item")):
		row.rate = pricing.standard_rate(invoice, row, rates)
	row.unit_conversion_factor = row.unit_conversion_factor or 1
	if not row.transfer_quantity:
		row.transfer_quantity = as_decimal(row.quantity) * as_decimal(row.unit_conversion_factor)
	if not row.account:
		row.account = item.expense_account if invoice.transaction_type == "purchase" else item.income_account


def _item_details(names):
	if not names:
		return {}
	rows = frappe.get_all(
		"Books Item",
		filters={"name": ["in", sorted(names)]},
		fields=[
			"name",
			"item_code",
			"description",
			"unit",
			"tax",
			"item_group.tax as group_tax",
			"income_account",
			"expense_account",
		],
	)
	for row in rows:
		row.tax = row.tax or row.group_tax
	return {row.name: row for row in rows}


def _tax_details(tax_name):
	if not tax_name:
		return []
	return frappe.get_cached_doc("Books Tax", tax_name).details


def _item_discount(row, amount, currency):
	if row.set_item_discount_amount:
		discount = as_decimal(row.item_discount_amount)
	else:
		discount = abs(amount) * as_decimal(row.item_discount_percent) / 100
	return rounded(-discount if amount < 0 else discount, currency)


def _invoice_discount(invoice, taxed_total, discounted_total, currency):
	if invoice.set_discount_amount:
		discount = rounded(abs(as_decimal(invoice.discount_amount)), currency)
		return -discount if discounted_total < 0 else discount
	base = taxed_total if invoice.discount_after_tax else discounted_total
	discount = abs(base) * as_decimal(invoice.discount_percent) / 100
	return rounded(-discount if base < 0 else discount, currency)
