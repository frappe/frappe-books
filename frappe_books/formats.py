"""Frappe's date and number formats closest to the Books date format and locale."""

import re

import frappe
from babel import Locale, UnknownLocaleError
from frappe import _

# Frappe's date format part for each Luxon token; L is a standalone month.
DATE_PARTS = {"d": "dd", "M": "mm", "L": "mm", "y": "yyyy"}
# Spaces and apostrophes that locales group digits with, as Frappe writes them.
GROUP_MARKS = {"\u00a0": " ", "\u202f": " ", "\u2019": "'"}
INDIAN_GROUPING = (3, 2)


def frappe_date_format(date_format: str) -> str:
	"""Frappe's date format with the day, month and year order of a Luxon format.

	A month name counts as the month, e.g. "MMM d, y" is mm-dd-yyyy.
	"""
	tokens = re.sub(r"'[^']*'", "", date_format).replace("L", "M")
	order = sorted("dMy", key=lambda token: _position(tokens, token))
	separator = next((char for char in tokens if char in "-/."), "-")
	options = system_settings_options("date_format")
	for mark in (separator, "-"):
		frappe_format = mark.join(DATE_PARTS[token] for token in order)
		if frappe_format in options:
			return frappe_format
	return "dd-mm-yyyy" if order.index("d") < order.index("M") else "mm-dd-yyyy"


def _position(tokens: str, token: str) -> int:
	index = tokens.find(token)
	return len(tokens) if index < 0 else index


def frappe_number_format(locale: str) -> str:
	"""Frappe's number format with the digit grouping and decimal mark of a BCP 47 locale."""
	try:
		parsed = Locale.parse(locale, sep="-")
	except (UnknownLocaleError, ValueError):
		frappe.throw(_("{0} is not a valid locale.").format(locale))
	symbols = parsed.number_symbols["latn"]
	decimal = symbols["decimal"]
	group = GROUP_MARKS.get(symbols["group"], symbols["group"])
	if parsed.decimal_formats[None].grouping == INDIAN_GROUPING and (group, decimal) == (",", "."):
		return "#,##,###.##"
	number_format = f"#{group}###{decimal}##"
	if number_format in system_settings_options("number_format"):
		return number_format
	return "#.###,##" if decimal == "," else "#,###.##"


def system_settings_options(fieldname: str) -> list[str]:
	return frappe.get_meta("System Settings").get_options(fieldname).split("\n")
