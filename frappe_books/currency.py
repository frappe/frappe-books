"""Currency metadata used for company number display defaults."""

from decimal import Decimal

from babel.numbers import get_currency_precision


def currency_precision(currency: str) -> int:
	return get_currency_precision(currency)


def smallest_unit(currency: str) -> Decimal:
	return Decimal(1).scaleb(-currency_precision(currency))


def currency_fraction_values(currency: str) -> dict[str, int | Decimal]:
	"""Return fractional-unit defaults from Babel's CLDR currency data."""
	precision = currency_precision(currency)
	return {
		"fraction_units": 10**precision if precision else 0,
		"smallest_value": smallest_unit(currency),
	}
