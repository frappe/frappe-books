import frappe
from frappe import client
from frappe.tests import IntegrationTestCase

from frappe_books.accounting.money import company_currency
from frappe_books.settings import regional_code
from frappe_books.tests.accounting import ensure_user
from frappe_books.tests.test_settings_rules import COMPANY

BOOKS_MANAGER = "books-settings-manager@example.com"


class IntegrationTestSystemSettings(IntegrationTestCase):
	"""Books reads the company country and currency from Frappe's System Settings."""

	def test_company_currency_is_the_system_settings_currency(self):
		with self.change_settings("System Settings", currency="EUR"):
			self.assertEqual(company_currency(), "EUR")

	def test_settings_show_system_settings_country_and_currency(self):
		with self.change_settings("System Settings", country="Switzerland", currency="CHF"):
			self.assertEqual(frappe.get_single("Books System Settings").as_dict()["currency"], "CHF")
			self.assertEqual(
				frappe.get_single("Books Accounting Settings").as_dict()["country"], "Switzerland"
			)

	def test_saving_settings_leaves_system_settings_country_and_currency(self):
		with self.change_settings("System Settings", country="Switzerland", currency="CHF"):
			system_settings = frappe.get_single("Books System Settings")
			system_settings.update({"currency": "EUR"})
			system_settings.save()
			frappe.db.set_single_value("Books Accounting Settings", COMPANY)
			accounting_settings = frappe.get_single("Books Accounting Settings")
			accounting_settings.update({"country": "Germany"})
			accounting_settings.save()

			self.assertEqual(frappe.db.get_single_value("System Settings", "currency"), "CHF")
			self.assertEqual(frappe.db.get_single_value("System Settings", "country"), "Switzerland")
			self.assertEqual(frappe.get_single("Books System Settings").currency, "CHF")
			self.assertEqual(frappe.get_single("Books Accounting Settings").country, "Switzerland")

	def test_settings_link_country_and_currency_to_frappe(self):
		self.assertEqual(frappe.get_meta("Books System Settings").get_field("currency").options, "Currency")
		self.assertEqual(frappe.get_meta("Books Accounting Settings").get_field("country").options, "Country")

	def test_books_manager_saves_settings_without_changing_system_settings(self):
		currency = frappe.db.get_single_value("System Settings", "currency")
		with self.set_user(ensure_user(BOOKS_MANAGER, "Books Manager")):
			values = client.get("Books System Settings")
			client.save({**values, "dark_mode": 1, "currency": "EUR" if currency != "EUR" else "CHF"})

		self.assertEqual(frappe.db.get_single_value("Books System Settings", "dark_mode"), 1)
		self.assertEqual(frappe.db.get_single_value("System Settings", "currency"), currency)

	def test_regional_code_comes_from_the_country(self):
		for country, code in (("India", "in"), ("Switzerland", "ch"), ("Germany", "-"), (None, "-")):
			with self.subTest(country=country), self.change_settings("System Settings", country=country):
				self.assertEqual(regional_code(), code)

	def test_gstin_is_checked_for_an_indian_company(self):
		for country, is_checked in (("India", True), ("Germany", False)):
			with self.subTest(country=country), self.change_settings("System Settings", country=country):
				frappe.db.set_single_value("Books Accounting Settings", COMPANY)
				settings = frappe.get_single("Books Accounting Settings")
				settings.gstin = "invalid"
				if is_checked:
					self.assertRaisesRegex(frappe.ValidationError, "valid 15-character", settings.save)
				else:
					settings.save()
