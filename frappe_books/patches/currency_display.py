"""Set currency display defaults for existing companies."""

import frappe
from babel.numbers import is_currency

from frappe_books.accounting.money import as_decimal
from frappe_books.currency import currency_fraction_values, currency_precision


def execute():
	update_currency_fractions()
	settings = frappe.get_single("Books System Settings")
	if settings.display_precision == 2:
		frappe.db.set_single_value(
			"Books System Settings", "display_precision", currency_precision(settings.currency)
		)


def update_currency_fractions():
	"""Repair standard currency defaults while preserving larger cash increments."""
	for currency in frappe.get_all("Books Currency", fields=["name", "fraction_units", "smallest_value"]):
		if not is_currency(currency.name):
			continue
		values = currency_fraction_values(currency.name)
		if as_decimal(currency.smallest_value) >= values["smallest_value"]:
			values.pop("smallest_value")
		changes = {field: value for field, value in values.items() if currency.get(field) != value}
		if changes:
			frappe.db.set_value("Books Currency", currency.name, changes, update_modified=False)
