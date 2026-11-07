"""Decimal helpers for consistent accounting calculations across databases."""

from decimal import ROUND_HALF_UP, Decimal

import frappe
from frappe import _
from frappe.utils import fmt_money

from frappe_books.currency import smallest_unit

# Frappe stores numbers as decimal(21,9), which holds 12 digits before the point.
NUMBER_LIMIT = Decimal(10) ** 12
NUMBER_FIELDTYPES = ("Currency", "Float", "Percent")


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


def format_money(value, currency=None) -> str:
	"""Write an amount as the company shows money, e.g. ₹ 1,000.00."""
	return fmt_money(value, currency=currency or company_currency())


def validate_number_sizes(doc):
	"""Throw, before the database would, when a row or document number is too large to store; rows first,
	as their numbers make the totals."""
	for row in (*doc.get_all_children(), doc):
		for df in row.meta.get("fields", {"fieldtype": ("in", NUMBER_FIELDTYPES)}):
			if abs(as_decimal(row.get(df.fieldname))) >= NUMBER_LIMIT:
				label = _(df.label)
				if row.get("parentfield"):
					label = _("Row #{0}: {1}").format(row.idx, label)
				frappe.throw(_("{0} is too large.").format(label))
