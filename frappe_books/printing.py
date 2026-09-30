"""Jinja methods the Books print formats use: settings, totals and Books formatting."""

from __future__ import annotations

from collections import defaultdict
from decimal import ROUND_HALF_UP
from typing import Any

import frappe
from babel import Locale
from babel.numbers import parse_pattern
from frappe import _
from frappe.custom.doctype.property_setter.property_setter import delete_property_setter, make_property_setter
from frappe.model import no_value_fields, table_fields
from frappe.utils import flt, formatdate, money_in_words
from frappe.www.printview import get_print_style, get_rendered_template
from jinja2 import TemplateError

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
	"""Return the totals a print format shows besides the document's own fields."""
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


def default_print_format(doctype: str) -> str | None:
	return frappe.get_meta(doctype).default_print_format or None


def set_default_print_format(doctype: str, print_format: str | None) -> None:
	"""Set or clear a DocType's default print format, as Frappe's Set as Default does."""
	if print_format:
		make_property_setter(doctype, None, "default_print_format", print_format, "Data", for_doctype=True)
	else:
		delete_property_setter(doctype, "default_print_format")


def update_default_print_formats(print_formats: dict[str, str | None]) -> None:
	"""Set the default print formats that change, by DocType."""
	for doctype, print_format in print_formats.items():
		if (print_format or None) != default_print_format(doctype):
			validate_print_format(print_format, doctype)
			set_default_print_format(doctype, print_format)


def validate_print_format(print_format: str | None, doctype: str) -> None:
	if print_format and frappe.db.get_value("Print Format", print_format, "doc_type") != doctype:
		frappe.throw(_("{0} is not a print format for {1}.").format(print_format, _(doctype)))


@frappe.whitelist(methods=["POST"])
def preview_print_format(doctype: str, name: str, html: str, css: str | None = None) -> dict[str, str]:
	"""Render unsaved print format HTML for a document, as Frappe's print preview does."""
	frappe.has_permission("Print Format", "write", throw=True)
	print_format = frappe.get_doc(
		{
			"doctype": "Print Format",
			"name": "Books Print Preview",
			"doc_type": doctype,
			"custom_format": 1,
			"html": html,
			"css": css,
		}
	)
	try:
		body = get_rendered_template(frappe.get_doc(doctype, name), print_format=print_format)
	except TemplateError as error:
		frappe.throw(template_error_message(error), title=_("Template Error"))
	return {"html": body, "style": get_print_style(print_format=print_format)}


def template_error_message(error: TemplateError) -> str:
	line = getattr(error, "lineno", None)
	return _("Line {0}: {1}").format(line, error.message) if line else str(error)


@frappe.whitelist()
def get_print_hints(doctype: str) -> dict[str, Any]:
	"""The values a print format for `doctype` can show, with their labels."""
	frappe.has_permission(doctype, "read", throw=True)
	accounting = frappe.get_meta("Books Accounting Settings")
	return {
		"doc": {"name": _("Name"), **field_hints(frappe.get_meta(doctype))},
		"print": {
			**field_hints(frappe.get_meta("Books Print Settings")),
			**{fieldname: _(accounting.get_label(fieldname)) for fieldname in TAX_ID_FIELDS},
		},
	}


def field_hints(meta) -> dict[str, Any]:
	"""Field labels by fieldname, with a child table as a list of its row's labels."""
	hints = {}
	for field in meta.fields:
		if field.fieldtype in table_fields:
			hints[field.fieldname] = [field_hints(frappe.get_meta(field.options))]
		elif field.fieldtype not in no_value_fields:
			hints[field.fieldname] = _(field.label)
	return hints
