"""Currency defaults must follow metadata across supported decimal precisions."""

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase, UnitTestCase

from frappe_books.currency import currency_fraction_values, currency_precision
from frappe_books.patches import currency_display
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

	def test_upgrade_repairs_multiple_currencies_and_is_repeatable(self):
		for currency, _, _, _ in CURRENCIES:
			ensure_currency(currency)
			frappe.db.set_value("Books Currency", currency, {"fraction_units": 100, "smallest_value": 0})
		for _ in range(2):
			currency_display.update_currency_fractions()
			for currency, _, units, minimum in CURRENCIES:
				with self.subTest(currency=currency):
					record = frappe.get_doc("Books Currency", currency)
					self.assertEqual(record.fraction_units, units)
					self.assertEqual(Decimal(str(record.smallest_value)), minimum)

	def test_upgrade_preserves_custom_settings_and_unknown_currencies(self):
		ensure_currency("CHF")
		frappe.get_doc(
			{"doctype": "Books Currency", "name": "CUSTOM", "fraction_units": 1000, "smallest_value": 0.005}
		).insert()
		frappe.db.set_single_value("Books System Settings", {"currency": "BHD", "display_precision": 4})
		currency_display.execute()
		self.assertEqual(frappe.db.get_single_value("Books System Settings", "display_precision"), 4)
		self.assertEqual(
			Decimal(str(frappe.db.get_value("Books Currency", "CHF", "smallest_value"))), Decimal("0.05")
		)
		self.assertEqual(frappe.db.get_value("Books Currency", "CUSTOM", "fraction_units"), 1000)
		self.assertEqual(
			Decimal(str(frappe.db.get_value("Books Currency", "CUSTOM", "smallest_value"))), Decimal("0.005")
		)
