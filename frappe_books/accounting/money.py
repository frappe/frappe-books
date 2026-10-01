"""Decimal helpers for consistent accounting calculations across databases."""

from decimal import ROUND_HALF_UP, Decimal

import frappe
from frappe import _

from frappe_books.currency import smallest_unit


def as_decimal(value=0) -> Decimal:
	return Decimal(str(value or 0))


def sum_decimal(values) -> Decimal:
	return sum((as_decimal(value) for value in values), Decimal(0))


def rounded(value, currency=None) -> Decimal:
	"""Round to the smallest unit of `currency`, or of the company currency."""
	return as_decimal(value).quantize(currency_unit(currency), rounding=ROUND_HALF_UP)


def currency_unit(currency=None) -> Decimal:
	return smallest_unit(currency or company_currency())


def company_currency() -> str:
	currency = frappe.db.get_single_value("System Settings", "currency")
	if not currency:
		frappe.throw(_("Set the company currency in System Settings."))
	return currency


def plain_number(value) -> str:
	"""Write a number without trailing zeros or an exponent, e.g. 2 or 2.5."""
	return format(as_decimal(value).normalize(), "f")
