# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.desk.page.setup_wizard.setup_wizard import get_setup_wizard_url
from frappe.geo.country_info import get_country_info
from frappe.tests import IntegrationTestCase

from frappe_books.coa import STANDARD_CHART, chart_options, find_ledger_account, load_chart
from frappe_books.frappe_books.doctype.books_accounting_settings.books_accounting_settings import (
	ACCOUNT_TYPES as ACCOUNTING_RULES,
)
from frappe_books.frappe_books.doctype.books_inventory_settings.books_inventory_settings import (
	ACCOUNT_TYPES as INVENTORY_RULES,
)
from frappe_books.frappe_books.doctype.books_pos_settings.books_pos_settings import (
	ACCOUNT_TYPES as POS_RULES,
)
from frappe_books.frappe_books.doctype.books_setup_wizard.books_setup_wizard import complete_setup
from frappe_books.setup_service import default_accounts, run_setup
from frappe_books.tests.accounting import ensure_user, unique_name

# System Settings fields Frappe's setup fills; tests restore them so cached defaults stay right.
FRAPPE_SETUP_FIELDS = (
	"country",
	"currency",
	"language",
	"time_zone",
	"date_format",
	"time_format",
	"number_format",
	"float_precision",
	"rounding_method",
	"enable_scheduler",
	"backup_limit",
)
SETUP_ACCOUNT_RULES = {
	"write_off": POS_RULES["write_off_account"],
	"round_off": ACCOUNTING_RULES["round_off_account"],
	"cash": POS_RULES["cash_account"],
	"receivable": POS_RULES["default_account"],
	**INVENTORY_RULES,
}


class IntegrationTestBooksSetupWizard(IntegrationTestCase):
	def test_rejects_invalid_fiscal_year(self):
		wizard = self._wizard(fiscal_year_start="2027-04-01", fiscal_year_end="2027-03-31")
		with self.assertRaises(frappe.ValidationError):
			wizard.save(ignore_permissions=True)

	def test_setup_creates_standard_accounts_and_defaults(self):
		payment_accounts = ("sales_payment_account", "purchase_payment_account")
		frappe.db.set_single_value("Books Defaults", dict.fromkeys(payment_accounts))
		wizard = self._wizard(chart_of_accounts=STANDARD_CHART)
		wizard.save(ignore_permissions=True)
		run_setup(wizard)

		self.assertTrue(frappe.db.exists("Books Account", "Debtors"))
		self.assertEqual(
			frappe.db.get_value("Books Account", wizard.bank_name, "parent_books_account"),
			"Bank Accounts",
		)
		self.assertEqual(
			frappe.db.get_single_value("Books Accounting Settings", "company_name"),
			"Test Books Company",
		)
		self.assertEqual(
			frappe.db.get_single_value("Books Defaults", "sales_invoice_number_series"),
			"SINV-",
		)
		self.assertTrue(frappe.db.get_value("Currency", "INR", "enabled"))
		cash = frappe.db.get_single_value("Books Pos Settings", "cash_account")
		for method, account in (("Cash", cash), ("Bank", wizard.bank_name)):
			self.assertEqual(frappe.db.get_value("Books Payment Method", method, "account"), account)
		# Invoices stay unpaid on submit until the user picks an automatic payment account.
		for fieldname in payment_accounts:
			self.assertFalse(frappe.db.get_single_value("Books Defaults", fieldname), fieldname)
		self.assert_gst_heads()
		self.assertTrue(frappe.db.exists("Books Tax", "GST-18"))
		gst = frappe.get_doc("Books Tax", "GST-18")
		self.assertEqual([(row.account, row.rate) for row in gst.details], [("CGST", 9), ("SGST", 9)])

	def test_setup_leaves_auto_stock_transfer_to_the_user(self):
		frappe.db.set_single_value(
			"Books Defaults", {"shipment_location": None, "purchase_receipt_location": None}
		)
		wizard = self._wizard(chart_of_accounts=STANDARD_CHART)
		wizard.save(ignore_permissions=True)
		run_setup(wizard)

		# A transfer location makes every invoice move stock on submit once inventory is on.
		defaults = frappe.get_single("Books Defaults")
		self.assertFalse(defaults.shipment_location)
		self.assertFalse(defaults.purchase_receipt_location)

	def test_setup_creates_the_selected_country_chart(self):
		wizard = self._wizard(chart_of_accounts="India - Chart of Accounts")
		wizard.save(ignore_permissions=True)
		run_setup(wizard)

		self.assertTrue(frappe.db.exists("Books Account", "Print and Stationary"))
		self.assertEqual(
			frappe.db.get_value("Books Account", wizard.bank_name, "parent_books_account"),
			"Bank Accounts",
		)
		self.assertEqual(
			frappe.db.get_single_value("Books Accounting Settings", "round_off_account"), "Rounded Off"
		)
		self.assertEqual(
			frappe.db.get_single_value("Books Inventory Settings", "stock_in_hand"), "Stock In Hand"
		)
		self.assertEqual(
			frappe.db.get_single_value("Books Inventory Settings", "stock_adjustment"), "Stock Adjustment"
		)
		self.assert_gst_heads()

	def test_setup_adapts_defaults_to_a_numbered_chart(self):
		wizard = self._wizard(country="Guatemala", currency="GTQ", chart_of_accounts="Guatemala - Cuentas")
		wizard.save(ignore_permissions=True)
		with self.restored_system_settings():
			run_setup(wizard)

		self.assertTrue(frappe.db.exists("Books Account", "Caja - 1.9.1"))
		self.assertEqual(
			frappe.db.get_value("Books Account", wizard.bank_name, "parent_books_account"),
			"Caja y Equivalentes - 1.9",
		)
		# The chart's first cash and receivable accounts are empty groups.
		self.assert_pos_accounts_are_ledgers()
		self.assertEqual(frappe.db.get_value("Books Account", "Discounts", "root_type"), "Income")
		self.assertFalse(frappe.db.get_single_value("Books Accounting Settings", "write_off_account"))
		# The chart has no postable round-off or stock account, only groups or other types.
		self.assertFalse(frappe.db.get_single_value("Books Accounting Settings", "round_off_account"))
		self.assertFalse(frappe.db.get_single_value("Books Inventory Settings", "stock_in_hand"))

	def test_setup_makes_a_cash_ledger_for_a_chart_without_one(self):
		wizard = self._wizard(
			country="Canada",
			currency="CAD",
			chart_of_accounts="Canada - Plan comptable pour les provinces francophones",
		)
		wizard.save(ignore_permissions=True)
		with self.restored_system_settings():
			run_setup(wizard)

		self.assert_pos_accounts_are_ledgers()

	def test_setup_offers_every_shipped_chart_and_rejects_others(self):
		charts = {chart["name"]: chart for chart in chart_options()}
		self.assertEqual(chart_options()[0]["name"], STANDARD_CHART)
		self.assertEqual(charts["Canada - Plan comptable pour les provinces francophones"]["language"], "fr")
		self.assertEqual(charts["Switzerland - General Chart of Accounts"]["country_code"], "ch")
		for name in charts:
			with self.subTest(chart=name):
				self.assert_settings_accept_default_accounts(load_chart(name))
		self.assertRaisesRegex(frappe.ValidationError, "Unknown chart of accounts", load_chart, "Standard")

	def test_setup_completes_frappe_setup_on_a_fresh_site(self):
		frappe.db.set_single_value("Books Accounting Settings", "setup_complete", 0)
		frappe.db.set_value("Installed Application", {"app_name": "frappe"}, "is_setup_complete", 0)
		frappe.clear_document_cache("Installed Applications", "Installed Applications")
		self._wizard(country="Switzerland", currency="CHF", time_zone="Europe/Zurich").save()

		with self.restored_system_settings():
			complete_setup()
			settings = frappe.get_single("System Settings")

		self.assertTrue(frappe.is_setup_complete())
		self.assertEqual(
			(settings.country, settings.currency, settings.time_zone, settings.date_format),
			(
				"Switzerland",
				"CHF",
				"Europe/Zurich",
				frappe.db.get_value("Country", "Switzerland", "date_format"),
			),
		)
		# Amounts in words follow the country's number format, e.g. lakh and crore for India.
		self.assertEqual(settings.number_format, get_country_info("Switzerland")["number_format"])

	def test_fresh_site_opens_the_books_setup_wizard(self):
		self.assertEqual(get_setup_wizard_url(), "/books")

	def test_wizard_takes_a_valid_time_zone(self):
		for time_zone, saved in (("Asia/Calcutta", "Asia/Kolkata"), (None, "Asia/Kolkata")):
			with self.subTest(time_zone=time_zone):
				wizard = self._wizard(time_zone=time_zone)
				wizard.save()
				self.assertEqual(wizard.time_zone, saved)
		self.assertRaisesRegex(
			frappe.ValidationError, "not a valid time zone", self._wizard(time_zone="Mars/Olympus").save
		)

	def test_wizard_takes_frappe_countries_and_currencies(self):
		for values in ({"country": "Atlantis"}, {"currency": "XXX"}):
			with self.subTest(values=values):
				self.assertRaises(frappe.LinkValidationError, self._wizard(**values).save)

	def test_preview_suggests_the_country_currency_chart_and_fiscal_year(self):
		wizard = frappe.get_doc({"doctype": "Books Setup Wizard", "country": "India"})
		with self.freeze_time("2026-09-30"):
			wizard.preview()
		self.assertEqual(wizard.currency, "INR")
		self.assertEqual(wizard.chart_of_accounts, "India - Chart of Accounts")
		self.assertEqual(
			(str(wizard.fiscal_year_start), str(wizard.fiscal_year_end)), ("2026-04-01", "2027-03-31")
		)

		wizard = frappe.get_doc({"doctype": "Books Setup Wizard", "country": "India"})
		with self.freeze_time("2027-02-10"):
			wizard.preview()
		self.assertEqual(
			(str(wizard.fiscal_year_start), str(wizard.fiscal_year_end)), ("2026-04-01", "2027-03-31")
		)

	def test_preview_suggests_the_currency_from_frappe_country_data(self):
		# Books' own copy had Croatia's old kuna, which is no Frappe Currency.
		wizard = frappe.get_doc({"doctype": "Books Setup Wizard", "country": "Croatia"})
		wizard.preview()
		self.assertEqual(wizard.currency, "EUR")

	def test_preview_keeps_values_the_user_set(self):
		wizard = frappe.get_doc(
			{
				"doctype": "Books Setup Wizard",
				"country": "India",
				"currency": "USD",
				"chart_of_accounts": STANDARD_CHART,
				"fiscal_year_start": "2026-07-01",
			}
		)
		wizard.preview()
		self.assertEqual((wizard.currency, wizard.chart_of_accounts), ("USD", STANDARD_CHART))
		self.assertEqual(
			(str(wizard.fiscal_year_start), str(wizard.fiscal_year_end)), ("2026-07-01", "2027-03-31")
		)

	def test_preview_takes_each_fiscal_date_from_the_other_without_country_dates(self):
		wizard = frappe.get_doc({"doctype": "Books Setup Wizard", "country": "Germany"})
		wizard.preview()
		self.assertEqual(
			(wizard.currency, wizard.fiscal_year_start, wizard.fiscal_year_end), ("EUR", None, None)
		)

		wizard.fiscal_year_start = "2026-07-01"
		wizard.preview()
		self.assertEqual(str(wizard.fiscal_year_end), "2027-06-30")

		wizard.fiscal_year_start, wizard.fiscal_year_end = None, "2026-12-31"
		wizard.preview()
		self.assertEqual(str(wizard.fiscal_year_start), "2026-01-01")

	def test_preview_picks_a_country_chart_in_the_user_language(self):
		for language, chart in (
			("en", STANDARD_CHART),
			("fr", "Canada - Plan comptable"),
			("fr-CA", "Canada"),
		):
			with self.subTest(language=language):
				frappe.local.lang = language
				wizard = frappe.get_doc({"doctype": "Books Setup Wizard", "country": "Canada"})
				wizard.preview()
				self.assertTrue(wizard.chart_of_accounts.startswith(chart))
		frappe.local.lang = "en"

	def test_preview_suggests_the_currency_of_frappe_country_names(self):
		wizard = frappe.get_doc({"doctype": "Books Setup Wizard", "country": "Türkiye"})
		wizard.preview()
		self.assertEqual(wizard.currency, "TRY")

	def test_preview_needs_the_right_to_set_up_books(self):
		wizard = frappe.get_doc({"doctype": "Books Setup Wizard", "country": "India"})
		with self.set_user(ensure_user("books-wizard-user@example.com", "Books User")):
			self.assertRaises(frappe.PermissionError, wizard.preview)

	def test_setup_completes_only_once(self):
		frappe.db.set_single_value("Books Accounting Settings", "setup_complete", 0)
		self._wizard().save()

		complete_setup()

		self.assertTrue(frappe.db.get_single_value("Books Accounting Settings", "setup_complete"))
		self.assertRaises(frappe.ValidationError, complete_setup)

	def restored_system_settings(self):
		settings = frappe.get_single("System Settings")
		return self.change_settings(
			"System Settings", {field: settings.get(field) for field in FRAPPE_SETUP_FIELDS}
		)

	def assert_settings_accept_default_accounts(self, chart):
		by_name = {account.name: account for account in chart}
		picks = {**default_accounts(chart), "cash": find_ledger_account(chart, ["Cash"], "Cash")}
		for key, name in picks.items():
			if not name:
				continue
			account, rules = by_name[name], SETUP_ACCOUNT_RULES[key]
			self.assertFalse(account.is_group, name)
			self.assertIn(account.account_type, rules.get("account_types", (account.account_type,)), name)
			self.assertIn(account.root_type, rules.get("root_types", (account.root_type,)), name)

	def assert_gst_heads(self):
		accounts = ("CGST", "SGST", "IGST", "Exempt")
		heads = [frappe.db.get_value("Books Account", account, "gst_head") for account in accounts]
		self.assertEqual(heads, list(accounts))

	def assert_pos_accounts_are_ledgers(self):
		for fieldname, account_type in (("cash_account", "Cash"), ("default_account", "Receivable")):
			account = frappe.db.get_single_value("Books Pos Settings", fieldname)
			self.assertEqual(
				frappe.db.get_value("Books Account", account, ["is_group", "account_type"]), (0, account_type)
			)

	def _wizard(self, **values):
		wizard = frappe.get_single("Books Setup Wizard")
		wizard.update(
			{
				"company_name": "Test Books Company",
				"fullname": "Test Owner",
				"email": "owner@example.com",
				"country": "India",
				"currency": "INR",
				"bank_name": unique_name("Test Primary Bank"),
				"chart_of_accounts": STANDARD_CHART,
				"fiscal_year_start": "2026-04-01",
				"fiscal_year_end": "2027-03-31",
				**values,
			}
		)
		return wizard
