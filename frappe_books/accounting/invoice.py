"""Invoice calculations, validation, posting, and cancellation behavior."""

from collections import defaultdict

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.accounting.ledger import LedgerPosting, delete_entries, reverse_entries
from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.accounting.outstanding import update_party_outstanding
from frappe_books.commerce import loyalty, pricing
from frappe_books.inventory.auto_transfer import cancel_auto_transfer, create_auto_transfer
from frappe_books.series import SeriesNamingMixin


class InvoiceController(SeriesNamingMixin, Document):
	transaction_type = "quote"

	def before_validate(self):
		_populate_invoice_defaults(self)
		calculate_invoice(self)
		pricing.apply_pricing(self)
		_populate_invoice_defaults(self)
		calculate_invoice(self)

	def validate(self):
		validate_invoice(self)
		loyalty.validate_invoice_loyalty(self)
		if self.transaction_type == "sales" and self.redeem_loyalty_points:
			calculate_invoice(self)

	def on_submit(self):
		if self.transaction_type == "quote":
			return
		post_invoice(self)
		outstanding = abs(as_decimal(self.base_grand_total))
		if self.get("return_against"):
			outstanding = -outstanding
		frappe.db.set_value(
			self.doctype,
			self.name,
			"outstanding_amount",
			rounded(outstanding),
			update_modified=False,
		)
		update_party_outstanding(self.party)
		pricing.update_coupon_usage(self, 1)
		loyalty.process_invoice(self)
		create_auto_transfer(self)
		if self.get("return_against"):
			update_return_status(self, include_current=True)

	def before_cancel(self):
		if self.transaction_type != "quote":
			cancel_auto_transfer(self)

	def on_cancel(self):
		if self.transaction_type == "quote":
			return
		reverse_entries(self)
		frappe.db.set_value(self.doctype, self.name, "outstanding_amount", 0, update_modified=False)
		update_party_outstanding(self.party)
		pricing.update_coupon_usage(self, -1)
		loyalty.reverse_invoice(self)
		if self.get("return_against"):
			update_return_status(self, include_current=False)

	def on_trash(self):
		delete_entries(self)


def calculate_invoice(invoice):
	if not invoice.get("items"):
		return
	currency = invoice.get("currency")
	tax_totals = defaultdict(as_decimal)
	tax_rates = {}
	net_total = as_decimal(0)
	item_discount_total = as_decimal(0)
	item_taxed_total = as_decimal(0)

	for row in invoice.items:
		amount = rounded(as_decimal(row.rate) * as_decimal(row.quantity), currency)
		discount = _item_discount(row, amount, currency)
		discounted = amount - discount
		tax_base = amount if invoice.discount_after_tax else discounted
		row_tax = as_decimal(0)
		for detail in _tax_details(row.tax):
			tax_amount = rounded(tax_base * as_decimal(detail.rate) / 100, currency)
			tax_totals[detail.account] += tax_amount
			tax_rates.setdefault(detail.account, detail.rate)
			row_tax += tax_amount
		if invoice.discount_after_tax:
			discount = _item_discount(row, amount + row_tax, currency)
		row.amount = amount
		row.item_discounted_total = amount + row_tax - discount if invoice.discount_after_tax else discounted
		row.item_taxed_total = amount + row_tax if invoice.discount_after_tax else amount + row_tax - discount
		net_total += amount
		item_discount_total += discount
		item_taxed_total += as_decimal(row.item_taxed_total)

	invoice.set("taxes", [])
	for account, amount in tax_totals.items():
		invoice.append("taxes", {"account": account, "rate": tax_rates[account], "amount": amount})
	invoice.net_total = net_total
	invoice_discount = _invoice_discount(invoice, item_taxed_total, net_total - item_discount_total, currency)
	invoice.discount_amount = invoice_discount
	invoice.grand_total = net_total + sum(tax_totals.values()) - item_discount_total - invoice_discount
	if invoice.transaction_type == "sales":
		invoice.grand_total = rounded(
			as_decimal(invoice.grand_total) - loyalty.redemption_amount(invoice), currency
		)
	invoice.base_grand_total = rounded(
		as_decimal(invoice.grand_total) * as_decimal(invoice.exchange_rate or 1)
	)
	if invoice.docstatus == 0:
		invoice.outstanding_amount = abs(as_decimal(invoice.base_grand_total))


def validate_invoice(invoice):
	if not invoice.items:
		frappe.throw(_("At least one invoice item is required."))
	if invoice.exchange_rate is not None and as_decimal(invoice.exchange_rate) <= 0:
		frappe.throw(_("Exchange rate must be greater than zero."))
	for row in invoice.items:
		if not row.item:
			frappe.throw(_("Every invoice row requires an item."))
		quantity = as_decimal(row.quantity)
		if quantity == 0:
			frappe.throw(_("Item quantity cannot be zero."))
		if quantity < 0 and not invoice.get("return_against"):
			frappe.throw(_("Negative quantities require a return-against invoice."))
		if as_decimal(row.rate) < 0:
			frappe.throw(_("Item rate cannot be negative."))
	if invoice.get("return_against"):
		_validate_return(invoice)


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
	item_discount = sum(
		(
			abs(as_decimal(row.item_taxed_total if invoice.discount_after_tax else row.amount))
			- abs(as_decimal(row.item_discounted_total))
			for row in invoice.items
		),
		as_decimal(0),
	)
	discount = abs((item_discount + as_decimal(invoice.discount_amount)) * exchange_rate)
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
	for row in invoice.get("items", []):
		item = items.get(row.item)
		if not item:
			continue
		for fieldname in ("item_code", "description", "rate", "unit", "tax"):
			if fieldname == "rate" and (row.is_manual_rate or row.get("is_free_item")):
				continue
			if not row.get(fieldname):
				row.set(fieldname, item.get(fieldname))
		if not row.transfer_unit:
			row.transfer_unit = row.unit
		if not row.unit_conversion_factor:
			row.unit_conversion_factor = 1
		if not row.transfer_quantity:
			row.transfer_quantity = as_decimal(row.quantity) * as_decimal(row.unit_conversion_factor)
		if not row.account:
			row.account = (
				item.income_account
				if invoice.transaction_type in {"sales", "quote"}
				else item.expense_account
			)


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
			"rate",
			"unit",
			"tax",
			"income_account",
			"expense_account",
		],
	)
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


def _validate_return(invoice):
	if not frappe.db.exists(invoice.doctype, invoice.return_against):
		frappe.throw(_("Return-against invoice {0} does not exist.").format(invoice.return_against))
	original = frappe.get_doc(invoice.doctype, invoice.return_against)
	if original.docstatus != 1 or original.get("return_against"):
		frappe.throw(_("Returns can only reference a submitted original invoice."))
	if original.party != invoice.party:
		frappe.throw(_("A return must use the same party as the original invoice."))

	original_quantities = _item_quantities(original)
	returned_quantities = _submitted_return_quantities(original, exclude=invoice.name)
	for item, quantity in _item_quantities(invoice).items():
		if item not in original_quantities:
			frappe.throw(_("Item {0} is not present in the original invoice.").format(item))
		if returned_quantities[item] + quantity > original_quantities[item]:
			frappe.throw(_("Returned quantity for item {0} exceeds the original invoice.").format(item))


def update_return_status(return_invoice, *, include_current):
	"""Keep the original invoice's return indicators consistent after submit or cancel."""
	original = frappe.get_doc(return_invoice.doctype, return_invoice.return_against)
	returned_quantities = _submitted_return_quantities(original, exclude=return_invoice.name)
	if include_current:
		for item, quantity in _item_quantities(return_invoice).items():
			returned_quantities[item] += quantity

	original_quantities = _item_quantities(original)
	is_returned = any(returned_quantities.values())
	is_fully_returned = bool(original_quantities) and all(
		returned_quantities[item] >= quantity for item, quantity in original_quantities.items()
	)
	frappe.db.set_value(
		original.doctype,
		original.name,
		{"is_returned": int(is_returned), "is_fully_returned": int(is_fully_returned)},
		update_modified=False,
	)


def _submitted_return_quantities(original, *, exclude=None):
	quantities = defaultdict(as_decimal)
	return_names = frappe.get_all(
		original.doctype,
		filters={"return_against": original.name, "docstatus": 1},
		pluck="name",
	)
	for name in return_names:
		if name == exclude:
			continue
		for item, quantity in _item_quantities(frappe.get_doc(original.doctype, name)).items():
			quantities[item] += quantity
	return quantities


def _item_quantities(invoice):
	quantities = defaultdict(as_decimal)
	for row in invoice.items:
		quantities[row.item] += abs(as_decimal(row.quantity))
	return quantities
