"""Currency defaults must follow metadata across supported decimal precisions."""

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase, UnitTestCase

from frappe_books.currency import currency_fraction_values, currency_precision
from frappe_books.setup_service import _update_system_settings, ensure_currency

CURRENCIES = (
	("JPY", 0, 0, Decimal("1")),
	("VUV", 0, 0, Decimal("1")),
	("USD", 2, 100, Decimal("0.01")),
	("BHD", 3, 1000, Decimal("0.001")),
	("CLF", 4, 10000, Decimal("0.0001")),
)


class UnitTestCurrencyMetadata(UnitTestCase):
	def test_currency_fraction_defaults(self):
		for currency, precision, units, minimum in CURRENCIES:
			with self.subTest(currency=currency):
				self.assertEqual(currency_precision(currency), precision)
				self.assertEqual(
					currency_fraction_values(currency),
					{
						"fraction_units": units,
						"smallest_value": minimum,
					},
				)


class IntegrationTestCurrencyMetadata(IntegrationTestCase):
	def test_setup_uses_currency_precision_and_fraction_defaults(self):
		for currency, precision, units, minimum in CURRENCIES:
			with self.subTest(currency=currency):
				ensure_currency(currency)
				record = frappe.get_doc("Books Currency", currency)
				self.assertEqual(record.fraction_units, units)
				self.assertEqual(Decimal(str(record.smallest_value)), minimum)
				_update_system_settings(frappe._dict(country="India", currency=currency))
				self.assertEqual(
					frappe.db.get_single_value("Books System Settings", "display_precision"), precision
				)

	def test_setup_preserves_cash_increment_from_core_currency(self):
		ensure_currency("CHF")
		self.assertEqual(frappe.db.get_value("Books Currency", "CHF", "fraction_units"), 100)
		self.assertEqual(
			Decimal(str(frappe.db.get_value("Books Currency", "CHF", "smallest_value"))), Decimal("0.05")
		)
