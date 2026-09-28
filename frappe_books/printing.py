"""Print context and totals shared by the Books print formats and print templates."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import frappe
from frappe.utils import flt, money_in_words

from frappe_books.accounting.invoice import InvoiceController, row_discount
from frappe_books.accounting.money import as_decimal, company_currency, sum_decimal
from frappe_books.accounting.payment import PaymentController, invoice_tax_shares
from frappe_books.inventory.transaction import StockMovementController, StockTransferController


def get_print_settings() -> dict[str, Any]:
	"""Return the small, presentation-safe context used by print formats."""
	settings = frappe.get_single("Books Print Settings")
	accounting = frappe.get_single("Books Accounting Settings")
	address = ""
	if settings.address and frappe.db.exists("Books Address", settings.address):
		address = frappe.db.get_value("Books Address", settings.address, "address_display") or ""
	return {
		"company_name": settings.company_name or accounting.company_name or "Frappe Books",
		"logo": settings.logo,
		"display_logo": settings.display_logo,
		"email": settings.email or accounting.email,
		"phone": settings.phone,
		"address": address,
		"color": settings.color or "#112B42",
		"gstin": accounting.gstin,
		"show_terms": settings.displaytermsandconditions,
		"terms": settings.terms_and_conditions,
	}


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
	item_discount = sum_decimal(row_discount(invoice, row) for row in invoice.items)
	totals = _amount_totals(invoice.grand_total, invoice.currency)
	totals["sub_total"] = as_decimal(invoice.grand_total) - tax
	totals["total_discount"] = item_discount + as_decimal(invoice.discount_amount)
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
	"""Each tax of the paid invoices, in the share of the invoice the payment settles."""
	taxes = defaultdict(as_decimal)
	for row in payment.payment_references:
		invoice = frappe.get_doc(row.reference_type, row.reference_name)
		for tax, share in invoice_tax_shares(invoice, as_decimal(row.amount)):
			taxes[tax.account] += share
	return [{"account": account, "amount": amount} for account, amount in taxes.items() if amount]


def amount_in_words(amount, currency) -> str:
	return money_in_words(abs(flt(amount)), currency)
