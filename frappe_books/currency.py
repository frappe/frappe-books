"""Currency precision from CLDR, which Frappe's Currency number formats do not match for every currency."""

from decimal import Decimal

from babel.numbers import get_currency_precision


def currency_precision(currency: str) -> int:
	return get_currency_precision(currency)


def smallest_unit(currency: str) -> Decimal:
	return Decimal(1).scaleb(-currency_precision(currency))
