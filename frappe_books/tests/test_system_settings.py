import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.accounting.money import company_currency
from frappe_books.settings import regional_code
from frappe_books.tests.accounting import ensure_user
from frappe_books.tests.test_settings_rules import COMPANY
from frappe_books.ui_bridge.database import BooksDatabaseBridge
from frappe_books.ui_bridge.field_properties import get_schema_field_properties

BOOKS_MANAGER = "books-settings-manager@example.com"


class IntegrationTestSystemSettings(IntegrationTestCase):
	"""Books reads the company country and currency from Frappe's System Settings."""

	def test_company_currency_is_the_system_settings_currency(self):
		with self.change_settings("System Settings", currency="EUR"):
			self.assertEqual(company_currency(), "EUR")

	def test_interface_shows_system_settings_country_and_currency(self):
		bridge = BooksDatabaseBridge()
		with self.change_settings("System Settings", country="Switzerland", currency="CHF"):
			self.assertEqual(bridge.get("SystemSettings", "SystemSettings")["currency"], "CHF")
			self.assertEqual(bridge.get("AccountingSettings", "AccountingSettings")["country"], "Switzerland")
			self.assertEqual(
				bridge.get_single_values([{"parent": "SystemSettings", "fieldname": "currency"}]),
				[{"parent": "SystemSettings", "fieldname": "currency", "value": "CHF"}],
			)

	def test_interface_links_country_and_currency_to_frappe(self):
		self.assertEqual(get_schema_field_properties("SystemSettings")["currency"]["options"], "Currency")
		self.assertEqual(get_schema_field_properties("AccountingSettings")["country"]["options"], "Country")

	def test_books_manager_saves_settings_without_changing_system_settings(self):
		bridge = BooksDatabaseBridge()
		with self.set_user(ensure_user(BOOKS_MANAGER, "Books Manager")):
			values = bridge.get("SystemSettings", "SystemSettings")
			bridge.update("SystemSettings", {**values, "darkMode": 1})
			self.assertEqual(frappe.db.get_single_value("Books System Settings", "dark_mode"), 1)
			self.assertRaises(
				frappe.PermissionError, bridge.update, "SystemSettings", {**values, "currency": "EUR"}
			)

	def test_system_manager_changes_the_currency_through_the_interface(self):
		bridge = BooksDatabaseBridge()
		values = bridge.get("SystemSettings", "SystemSettings")

		# Restoring the currency keeps Frappe's cached defaults right for later tests.
		with self.change_settings("System Settings", currency=values["currency"]):
			bridge.update("SystemSettings", {**values, "currency": "EUR"})
			self.assertEqual(frappe.db.get_single_value("System Settings", "currency"), "EUR")

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
