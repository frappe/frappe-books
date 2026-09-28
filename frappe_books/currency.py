"""Currency precision from CLDR, which Frappe's Currency number formats do not match for every currency, and exchange rates."""

from decimal import Decimal

import frappe
from babel.numbers import get_currency_precision
from frappe.integrations.utils import make_get_request
from frappe.utils import flt, getdate
from requests.exceptions import RequestException

RATES_URL = "https://api.vatcomply.com/rates"
RATE_CACHE_SECONDS = 24 * 60 * 60
RATE_RETRY_SECONDS = 10 * 60


def currency_precision(currency: str) -> int:
	return get_currency_precision(currency)


def smallest_unit(currency: str) -> Decimal:
	return Decimal(1).scaleb(-currency_precision(currency))


@frappe.whitelist()
def get_exchange_rate(from_currency: str, to_currency: str, date: str | None = None) -> float | None:
	"""Return the rate on `date` from a public rates service, or None when it has none.

	Only the currency codes and the date leave the server.
	"""
	date = getdate(date)
	key = f"books_exchange_rate:{date}:{from_currency}:{to_currency}"
	rate = frappe.cache.get_value(key, expires=True)
	if rate is None:
		rate = _fetch_exchange_rate(from_currency, to_currency, date)
		# A failed fetch is retried after a few minutes, not on every invoice edit.
		frappe.cache.set_value(key, rate, expires_in_sec=RATE_CACHE_SECONDS if rate else RATE_RETRY_SECONDS)
	return rate or None


def _fetch_exchange_rate(from_currency, to_currency, date) -> float:
	params = {"date": str(date), "base": from_currency, "symbols": to_currency}
	try:
		response = make_get_request(RATES_URL, params=params, timeout=5)
	except (RequestException, ValueError):
		return 0.0
	rates = response.get("rates") if isinstance(response, dict) else None
	return max(flt((rates or {}).get(to_currency)), 0.0)
