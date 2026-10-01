"""Books uses Frappe's Currency records and CLDR precision."""

from decimal import Decimal

import frappe
from frappe import client
from frappe.tests import IntegrationTestCase, UnitTestCase

from frappe_books.currency import currency_precision
from frappe_books.setup_service import _update_books_system_settings, enable_currency
from frappe_books.tests.accounting import ensure_user, make_account, make_party

CURRENCIES = (("JPY", 0), ("VUV", 0), ("USD", 2), ("BHD", 3), ("CLF", 4))
BOOKS_USER = "books-currency-user@example.com"
BOOKS_MANAGER = "books-currency-manager@example.com"


class UnitTestCurrencyMetadata(UnitTestCase):
	def test_currency_precision_follows_cldr(self):
		for currency, precision in CURRENCIES:
			with self.subTest(currency=currency):
				self.assertEqual(currency_precision(currency), precision)


class IntegrationTestCurrencyMetadata(IntegrationTestCase):
	def test_setup_uses_currency_precision(self):
		for currency, precision in CURRENCIES:
			with self.subTest(currency=currency):
				_update_books_system_settings(frappe._dict(country="India", currency=currency))
				self.assertEqual(
					frappe.db.get_single_value("Books System Settings", "display_precision"), precision
				)

	def test_setup_enables_the_company_currency(self):
		frappe.db.set_value("Currency", "BHD", "enabled", 0)

		enable_currency("BHD")

		self.assertEqual(frappe.db.get_value("Currency", "BHD", "enabled"), 1)

	def test_enabling_the_company_currency_refreshes_the_boot(self):
		frappe.db.set_value("Currency", "BHD", "enabled", 0)
		frappe.cache.hset("bootinfo", frappe.session.user, {"docs": []})

		enable_currency("BHD")

		self.assertIsNone(frappe.cache.hget("bootinfo", frappe.session.user))

	def test_books_user_reads_frappe_currencies(self):
		with self.set_user(ensure_user(BOOKS_USER, "Books User")):
			currency = client.get("Currency", "CHF")

		self.assertEqual(currency["name"], "CHF")
		self.assertEqual(currency["fraction_units"], 100)
		self.assertEqual(Decimal(str(currency["smallest_currency_fraction_value"])), Decimal("0.05"))

	def test_books_manager_adds_a_currency_through_the_interface(self):
		with self.set_user(ensure_user(BOOKS_MANAGER, "Books Manager")):
			client.insert({"doctype": "Currency", "currency_name": "XBK", "symbol": "B", "enabled": 1})

		self.assertEqual(frappe.db.get_value("Currency", "XBK", "symbol"), "B")

	def test_parties_link_to_frappe_currencies(self):
		receivable = make_account("Currency Debtors", account_type="Receivable")
		party = make_party(receivable.name, currency="EUR")

		self.assertEqual(frappe.db.get_value("Books Party", party.name, "currency"), "EUR")
		self.assertRaises(frappe.LinkValidationError, make_party, receivable.name, currency="XXX")
