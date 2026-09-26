"""Decimal helpers for consistent accounting calculations across databases."""

from decimal import ROUND_HALF_UP, Decimal

import frappe
from frappe import _

from frappe_books.currency import smallest_unit


def as_decimal(value=0) -> Decimal:
	return Decimal(str(value or 0))


def rounded(value, currency=None) -> Decimal:
	"""Round to the smallest unit of `currency`, or of the company currency."""
	return as_decimal(value).quantize(smallest_unit(currency or company_currency()), rounding=ROUND_HALF_UP)


def company_currency() -> str:
	currency = frappe.db.get_single_value("Books System Settings", "currency")
	if not currency:
		frappe.throw(_("Set the company currency in Books System Settings."))
	return currency
