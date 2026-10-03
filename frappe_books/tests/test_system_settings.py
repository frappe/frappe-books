import frappe
from frappe import client
from frappe.tests import IntegrationTestCase

from frappe_books.accounting.money import company_currency
from frappe_books.formats import frappe_date_format, frappe_number_format
from frappe_books.frappe_books.doctype.books_system_settings.books_system_settings import (
	set_display_precision,
)
from frappe_books.settings import regional_code
from frappe_books.tests.accounting import ensure_user
from frappe_books.tests.test_settings_rules import COMPANY

BOOKS_MANAGER = "books-settings-manager@example.com"
BOOKS_USER = "books-settings-user@example.com"
FRAPPE_FORMATS = {"date_format": "dd-mm-yyyy", "number_format": "#,###.##"}


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

	def test_display_precision_is_the_system_settings_currency_precision(self):
		with self.change_settings("System Settings", currency_precision="3"):
			self.assertEqual(frappe.get_single("Books System Settings").as_dict()["display_precision"], 3)
		# Without one, Frappe takes the decimals of its number format.
		with self.change_settings("System Settings", currency_precision="", number_format="#,###"):
			self.assertEqual(frappe.get_single("Books System Settings").display_precision, 0)

	def test_setting_display_precision_sets_system_settings_currency_precision(self):
		with self.change_settings("System Settings", currency_precision="2"):
			set_display_precision(3)

			self.assertEqual(frappe.db.get_single_value("System Settings", "currency_precision"), "3")
			self.assertEqual(frappe.get_single("Books System Settings").display_precision, 3)

	def test_saving_settings_leaves_system_settings_currency_precision(self):
		with self.change_settings("System Settings", currency_precision="2"):
			client.save({**client.get("Books System Settings"), "display_precision": 4})

			self.assertEqual(frappe.db.get_single_value("System Settings", "currency_precision"), "2")
			self.assertEqual(frappe.get_single("Books System Settings").display_precision, 2)

	def test_only_system_settings_editors_change_display_precision(self):
		with self.change_settings("System Settings", currency_precision="2"):
			with self.set_user(ensure_user(BOOKS_MANAGER, "Books Manager")):
				# The unchanged precision goes with each settings save.
				set_display_precision(2)
				self.assertRaises(frappe.PermissionError, set_display_precision, 3)
			with self.set_user(ensure_user(BOOKS_USER, "Books User")):
				self.assertRaises(frappe.PermissionError, set_display_precision, 2)

			self.assertEqual(frappe.db.get_single_value("System Settings", "currency_precision"), "2")

	def test_frappe_date_format_follows_the_day_month_year_order(self):
		cases = {
			"dd/MM/yyyy": "dd/mm/yyyy",
			"MM/dd/yyyy": "mm/dd/yyyy",
			"dd-MM-yyyy": "dd-mm-yyyy",
			"MM-dd-yyyy": "mm-dd-yyyy",
			"yyyy-MM-dd": "yyyy-mm-dd",
			"dd.MM.yyyy": "dd.mm.yyyy",
			"MMM d, y": "mm-dd-yyyy",
			"d MMM, y": "dd-mm-yyyy",
			"EEE, d MMM y": "dd-mm-yyyy",
			"LLLL d 'of' y": "mm-dd-yyyy",
			# Frappe has no other year-first or dotted month-first format.
			"yyyy/MM/dd": "yyyy-mm-dd",
			"MM.dd.yyyy": "mm-dd-yyyy",
		}
		for date_format, expected in cases.items():
			with self.subTest(date_format=date_format):
				self.assertEqual(frappe_date_format(date_format), expected)

	def test_frappe_number_format_follows_the_locale_marks(self):
		cases = {
			"en-IN": "#,##,###.##",
			"en-US": "#,###.##",
			"de-DE": "#.###,##",
			"fr-FR": "# ###,##",
			"sv-SE": "# ###,##",
			"de-CH": "#'###.##",
			"pt-BR": "#.###,##",
			"ja-JP": "#,###.##",
		}
		for locale, expected in cases.items():
			with self.subTest(locale=locale):
				self.assertEqual(frappe_number_format(locale), expected)
		self.assertRaisesRegex(frappe.ValidationError, "not a valid locale", frappe_number_format, "xx-QQ")

	def test_saving_formats_sets_frappe_formats(self):
		with self.change_settings("System Settings", FRAPPE_FORMATS):
			frappe.db.set_single_value(
				"Books System Settings", {"date_format": "dd/MM/yyyy", "locale": "en-US"}
			)
			settings = frappe.get_single("Books System Settings")
			settings.update({"date_format": "MMM d, y", "locale": "de-DE"})
			settings.save()

			self.assertEqual(
				frappe.db.get_value("System Settings", None, ["date_format", "number_format"], as_dict=True),
				{"date_format": "mm-dd-yyyy", "number_format": "#.###,##"},
			)

	def test_only_system_settings_editors_change_formats(self):
		with self.change_settings("System Settings", FRAPPE_FORMATS):
			frappe.db.set_single_value(
				"Books System Settings", {"date_format": "MMM d, y", "locale": "en-US"}
			)
			with self.set_user(ensure_user(BOOKS_MANAGER, "Books Manager")):
				values = client.get("Books System Settings")
				# Formats that differ from Frappe's stay until one of them changes.
				client.save({**values, "hide_get_started": 1})
				for fieldname, value in (("date_format", "dd/MM/yyyy"), ("locale", "de-DE")):
					with self.subTest(fieldname=fieldname):
						values = client.get("Books System Settings")
						self.assertRaises(frappe.PermissionError, client.save, {**values, fieldname: value})

			self.assertEqual(frappe.db.get_single_value("System Settings", "date_format"), "dd-mm-yyyy")

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
