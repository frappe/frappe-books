"""Jinja methods the Books print formats use: settings, totals and Books formatting."""

from __future__ import annotations

from collections import defaultdict
from decimal import ROUND_HALF_UP
from typing import Any

import frappe
from babel import Locale
from babel.numbers import parse_pattern
from frappe.utils import flt, formatdate, money_in_words

from frappe_books.accounting.invoice import InvoiceController
from frappe_books.accounting.money import as_decimal, company_currency, sum_decimal
from frappe_books.accounting.payment import PaymentController, tax_share
from frappe_books.inventory.transaction import StockMovementController, StockTransferController

TAX_ID_FIELDS = ("gstin", "tax_id")


def get_print_settings() -> dict[str, Any]:
	"""Books Print Settings with the company address and tax IDs, for print formats."""
	settings = frappe.get_cached_doc("Books Print Settings")
	accounting = frappe.get_cached_doc("Books Accounting Settings")
	address = settings.address and frappe.db.get_value("Books Address", settings.address, "address_display")
	return {
		**settings.as_dict(no_default_fields=True),
		"address": address,
		**{fieldname: accounting.get(fieldname) for fieldname in TAX_ID_FIELDS},
	}


def books_format(value, fieldtype: str, currency: str | None = None) -> str:
	"""Format a value as the Books app does, by the Books System Settings."""
	if value is None or value == "":
		return ""
	settings = frappe.get_cached_doc("Books System Settings")
	if fieldtype == "Currency":
		return format_amount(value, currency or company_currency(), settings)
	if fieldtype == "Float":
		return f"{flt(value):.{settings.display_precision}f}"
	if fieldtype == "Date":
		return formatdate(value, settings.date_format)
	return str(value)


def format_amount(value, currency: str, settings) -> str:
	"""The currency symbol, then the number grouped by the Books locale."""
	locale = Locale.parse(settings.locale, sep="-")
	precision = settings.display_precision
	pattern = parse_pattern(locale.decimal_formats[None])
	pattern.frac_prec = (precision, precision)
	# The Books app rounds half away from zero, where babel rounds half to even.
	number = pattern.apply(as_decimal(value).quantize(as_decimal(10) ** -precision, ROUND_HALF_UP), locale)
	symbol = frappe.db.get_value("Currency", currency, "symbol", cache=True)
	return f"{symbol} {number}" if symbol else number


def get_print_totals(doc) -> dict[str, Any]:
	"""Return the totals a print template shows besides the document's own fields."""
	if isinstance(doc, InvoiceController):
		return _invoice_totals(doc)
	if isinstance(doc, PaymentController):
		return _payment_totals(doc)
	if isinstance(doc, StockTransferController):
		return _amount_totals(doc.grand_total, company_currency())
	if isinstance(doc, StockMovementController):
		return _amount_totals(doc.amount, company_currency())
	return {}


def _amount_totals(amount, currency) -> dict[str, Any]:
	return {"sub_total": amount, "grand_total_in_words": amount_in_words(amount, currency)}


def _invoice_totals(invoice) -> dict[str, Any]:
	tax = sum_decimal(row.amount for row in invoice.taxes)
	totals = _amount_totals(invoice.grand_total, invoice.currency)
	totals["sub_total"] = as_decimal(invoice.grand_total) - tax
	if invoice.transaction_type != "quote":
		totals["payment_details"] = _payment_details(invoice)
	return totals


def _payment_details(invoice) -> list[dict[str, Any]]:
	"""Each submitted payment with the part of it allocated to the invoice, and the balance after it."""
	allocations = frappe.get_list(
		"Books Payment For",
		filters={"reference_type": invoice.doctype, "reference_name": invoice.name, "docstatus": 1},
		fields=["parent", "amount"],
		parent_doctype="Books Payment",
	)
	allocated = defaultdict(as_decimal)
	for row in allocations:
		allocated[row.parent] += as_decimal(row.amount)
	payments = frappe.get_list(
		"Books Payment",
		filters={"name": ["in", list(allocated)]},
		fields=["name", "payment_method", "amount_paid"],
		order_by="date asc, name asc",
	)
	balance = abs(as_decimal(invoice.base_grand_total))
	details = []
	for payment in payments:
		balance -= allocated[payment.name]
		details.append(
			{
				"amount": allocated[payment.name],
				"amount_paid": payment.amount_paid,
				"payment_method": payment.payment_method,
				"outstanding_amount": balance,
			}
		)
	return details


def _payment_totals(payment) -> dict[str, Any]:
	taxes = _payment_taxes(payment)
	currency = company_currency()
	totals = _amount_totals(payment.amount, currency)
	totals["sub_total"] = as_decimal(payment.amount) - sum_decimal(tax["amount"] for tax in taxes)
	totals["amount_paid_in_words"] = amount_in_words(payment.amount_paid, currency)
	totals["taxes"] = taxes
	return totals


def _payment_taxes(payment) -> list[dict[str, Any]]:
	"""Each tax of the paid invoices: the amount the payment realised, else the share it settles."""
	realised = defaultdict(as_decimal)
	for row in payment.taxes:
		realised[row.from_account] += as_decimal(row.amount)
	shares = defaultdict(as_decimal)
	for row in payment.payment_references:
		invoice = frappe.get_doc(row.reference_type, row.reference_name)
		if not as_decimal(invoice.base_grand_total):
			continue
		for tax in invoice.taxes:
			shares[tax.account] += tax_share(invoice, tax, as_decimal(row.amount))
	return [{"account": account, "amount": realised.get(account, share)} for account, share in shares.items()]


def amount_in_words(amount, currency) -> str:
	return money_in_words(abs(flt(amount)), currency)
