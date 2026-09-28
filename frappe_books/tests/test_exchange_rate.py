from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from requests.exceptions import ConnectionError

from frappe_books.accounting.money import company_currency
from frappe_books.currency import RATES_URL, get_exchange_rate
from frappe_books.tests.accounting import (
	foreign_currency,
	make_account,
	make_invoice,
	make_item,
	make_party,
)

REQUEST = "frappe_books.currency.make_get_request"
DATE = "2026-09-01"


class IntegrationTestExchangeRate(IntegrationTestCase):
	def setUp(self):
		frappe.cache.delete_value(f"books_exchange_rate:{DATE}:EUR:USD")

	def test_fetched_rate_is_cached_and_only_codes_and_date_are_sent(self):
		with patch(REQUEST, return_value={"rates": {"USD": 1.1234}}) as request:
			self.assertEqual(get_exchange_rate("EUR", "USD", DATE), 1.1234)
			self.assertEqual(get_exchange_rate("EUR", "USD", DATE), 1.1234)

		request.assert_called_once_with(
			RATES_URL, params={"date": DATE, "base": "EUR", "symbols": "USD"}, timeout=5
		)

	def test_failed_fetch_gives_no_rate_and_waits_before_retrying(self):
		for reply in ({"side_effect": ConnectionError}, {"return_value": {"rates": {}}}):
			with self.subTest(reply=reply), patch(REQUEST, **reply) as request:
				frappe.cache.delete_value(f"books_exchange_rate:{DATE}:EUR:USD")
				self.assertIsNone(get_exchange_rate("EUR", "USD", DATE))
				self.assertIsNone(get_exchange_rate("EUR", "USD", DATE))
				request.assert_called_once()

	def test_invoice_fetches_a_missing_rate_for_its_date(self):
		receivable = make_account("FX Receivable", account_type="Receivable")
		income = make_account("FX Sales", root_type="Income", account_type="Income Account")
		item = make_item(income.name, make_account("FX Expense", root_type="Expense").name)
		party = make_party(receivable.name, currency=foreign_currency())

		with patch("frappe_books.accounting.invoice.get_exchange_rate", return_value=80) as rate:
			invoice = make_invoice("Books Sales Invoice", party.name, receivable.name, item.name, income.name)

		self.assertEqual(invoice.exchange_rate, 80)
		rate.assert_called_with(invoice.currency, company_currency(), invoice.date)
