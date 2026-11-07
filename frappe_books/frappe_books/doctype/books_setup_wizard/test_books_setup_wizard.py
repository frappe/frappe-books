# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.desk.page.setup_wizard.setup_wizard import get_setup_wizard_url
from frappe.tests import IntegrationTestCase

from frappe_books.accounting.accounts import mode_of_payment_account
from frappe_books.coa import (
	STANDARD_CHART,
	chart_default_names,
	chart_options,
	find_default_account,
	load_chart,
)
from frappe_books.company import company_value, default_company
from frappe_books.frappe_books.doctype.books_company.books_company import (
	ACCOUNT_TYPES as COMPANY_RULES,
)
from frappe_books.frappe_books.doctype.books_pos_settings.books_pos_settings import (
	ACCOUNT_TYPES as POS_RULES,
)
from frappe_books.frappe_books.doctype.books_setup_wizard.books_setup_wizard import complete_setup
from frappe_books.setup_service import DEFAULT_ACCOUNTS, run_setup
from frappe_books.tests.accounting import ensure_user, unique_name

# System Settings fields Frappe's setup fills; tests restore them so cached defaults stay right.
FRAPPE_SETUP_FIELDS = (
	"country",
	"currency",
	"currency_precision",
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
	"payable": COMPANY_RULES["default_payable_account"],
	"income": COMPANY_RULES["default_income_account"],
	"write_off": POS_RULES["write_off_account"],
	"round_off": COMPANY_RULES["round_off_account"],
	"cash": POS_RULES["cash_account"],
	"receivable": POS_RULES["default_account"],
	"stock_in_hand": COMPANY_RULES["default_inventory_account"],
	"stock_received_but_not_billed": COMPANY_RULES["stock_received_but_not_billed"],
	"cost_of_goods_sold": COMPANY_RULES["default_expense_account"],
	"stock_adjustment": COMPANY_RULES["stock_adjustment_account"],
}


class SetupWizardTestMixin:
	"""Helpers for tests that run the setup."""

	def restored_system_settings(self):
		settings = frappe.get_single("System Settings")
		return self.change_settings(
			"System Settings", {field: settings.get(field) for field in FRAPPE_SETUP_FIELDS}
		)

	def assert_settings_accept_default_accounts(self, chart_name):
		chart = load_chart(chart_name)
		by_name = {account.name: account for account in chart}
		names = chart_default_names(chart_name)
		for key, default in DEFAULT_ACCOUNTS.items():
			name = find_default_account(chart, default, names.get(key))
			if not name:
				continue
			account, rules = by_name[name], SETUP_ACCOUNT_RULES[key]
			self.assertFalse(account.is_group, name)
			self.assertIn(account.account_type, rules.get("account_types", (account.account_type,)), name)
			self.assertIn(account.root_type, rules.get("root_types", (account.root_type,)), name)

	def assert_first_invoice_takes(self, receivable, income):
		customer = frappe.get_doc(
			{"doctype": "Books Customer", "customer_name": unique_name("First Customer")}
		).insert()
		item = frappe.get_doc({"doctype": "Books Item", "item_code": unique_name("First Item")}).insert()
		invoice = frappe.get_doc(
			{
				"doctype": "Books Sales Invoice",
				"customer": customer.name,
				"items": [{"item_code": item.name, "qty": 1, "price_list_rate": 100}],
			}
		).insert()
		self.assertEqual((invoice.debit_to, invoice.items[0].income_account), (receivable, income))

	def assert_gst_heads(self):
		accounts = ("CGST", "SGST", "IGST", "Exempt")
		heads = [frappe.db.get_value("Books Account", account, "gst_head") for account in accounts]
		self.assertEqual(heads, list(accounts))

	def assert_pos_accounts_are_ledgers(self):
		for fieldname, account_type in (("cash_account", "Cash"), ("default_account", "Receivable")):
			account = frappe.db.get_single_value("Books POS Settings", fieldname)
			self.assertEqual(
				frappe.db.get_value("Books Account", account, ["is_group", "account_type"]), (0, account_type)
			)

	def _wizard(self, **values):
		wizard = frappe.get_single("Books Setup Wizard")
		wizard.update(
			{
				# The site's one company, which a rerun of the setup keeps
				"company_name": default_company(),
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


class IntegrationTestBooksSetupWizard(SetupWizardTestMixin, IntegrationTestCase):
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
			frappe.db.get_value("Books Account", wizard.bank_name, "parent_account"),
			"Bank Accounts",
		)
		self.assertEqual(
			frappe.db.get_single_value("Books Defaults", "sales_invoice_number_series"),
			"SINV-",
		)
		self.assertTrue(frappe.db.get_value("Currency", "INR", "enabled"))
		cash = frappe.db.get_single_value("Books POS Settings", "cash_account")
		for method, account in (("Cash", cash), ("Bank", wizard.bank_name)):
			self.assertEqual(mode_of_payment_account(method), account)
		# Invoices stay unpaid on submit until the user picks an automatic payment account.
		for fieldname in payment_accounts:
			self.assertFalse(frappe.db.get_single_value("Books Defaults", fieldname), fieldname)
		self.assert_gst_heads()
		self.assertTrue(frappe.db.exists("Books Item Tax Template", "GST-18"))
		gst = frappe.get_doc("Books Item Tax Template", "GST-18")
		self.assertEqual([(row.tax_type, row.tax_rate) for row in gst.taxes], [("CGST", 9), ("SGST", 9)])

	def test_setup_makes_the_one_company(self):
		# A fresh site: no company, so no company rows on the seeded modes of payment.
		frappe.db.delete("Books Company")
		frappe.db.delete("Books Mode of Payment Account")
		wizard = self._wizard(company_name="Lin's Things")
		wizard.save(ignore_permissions=True)
		run_setup(wizard)

		self.assertEqual(company_value(["name", "abbr"]), ("Lin's Things", "LT"))

	def test_setup_leaves_auto_stock_transfer_to_the_user(self):
		frappe.db.set_single_value(
			"Books Defaults", {"delivery_note_location": None, "purchase_receipt_location": None}
		)
		wizard = self._wizard(chart_of_accounts=STANDARD_CHART)
		wizard.save(ignore_permissions=True)
		run_setup(wizard)

		# A transfer location makes every invoice move stock on submit once inventory is on.
		defaults = frappe.get_single("Books Defaults")
		self.assertFalse(defaults.delivery_note_location)
		self.assertFalse(defaults.purchase_receipt_location)

	def test_setup_creates_the_selected_country_chart(self):
		wizard = self._wizard(chart_of_accounts="India - Chart of Accounts")
		wizard.save(ignore_permissions=True)
		run_setup(wizard)

		self.assertTrue(frappe.db.exists("Books Account", "Print and Stationary"))
		self.assertEqual(
			frappe.db.get_value("Books Account", wizard.bank_name, "parent_account"),
			"Bank Accounts",
		)
		self.assertEqual(
			company_value(["round_off_account", "default_inventory_account", "stock_adjustment_account"]),
			("Rounded Off", "Stock In Hand", "Stock Adjustment"),
		)
		self.assert_gst_heads()

	def test_setup_adapts_defaults_to_a_numbered_chart(self):
		wizard = self._wizard(country="Guatemala", currency="GTQ", chart_of_accounts="Guatemala - Cuentas")
		wizard.save(ignore_permissions=True)
		with self.restored_system_settings():
			run_setup(wizard)

		self.assertTrue(frappe.db.exists("Books Account", "Caja - 1.9.1"))
		self.assertEqual(
			frappe.db.get_value("Books Account", wizard.bank_name, "parent_account"),
			"Caja y Equivalentes - 1.9",
		)
		# The chart's first cash and receivable accounts are empty groups.
		self.assert_pos_accounts_are_ledgers()
		self.assertEqual(frappe.db.get_value("Books Account", "Discounts", "root_type"), "Income")
		# The chart has no postable write-off, round-off or stock account, so setup makes them.
		self.assertEqual(
			company_value(["write_off_account", "round_off_account", "default_inventory_account"]),
			("Write Off", "Round Off", "Stock In Hand"),
		)

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
				self.assert_settings_accept_default_accounts(name)
		self.assertRaisesRegex(frappe.ValidationError, "Unknown chart of accounts", load_chart, "Standard")

	def test_every_country_chart_names_its_own_default_ledgers(self):
		for chart in chart_options()[1:]:
			with self.subTest(chart=chart["name"]):
				accounts = load_chart(chart["name"])
				names = chart_default_names(chart["name"])
				self.assertLessEqual({"receivable", "payable", "income"}, set(names))
				for key, name in names.items():
					self.assertEqual(find_default_account(accounts, DEFAULT_ACCOUNTS[key], name), name, key)

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
			(settings.country, settings.currency, settings.time_zone),
			("Switzerland", "CHF", "Europe/Zurich"),
		)
		self.assertEqual(
			(settings.date_format, settings.number_format),
			(frappe.db.get_value("Country", "Switzerland", "date_format"), "#'###.##"),
		)

	def test_setup_formats_dates_and_numbers_as_the_country_does(self):
		# Amounts in words follow the number format, e.g. lakh and crore for India.
		for country, currency, books_formats, frappe_formats in (
			("India", "INR", ["dd-MM-yyyy", "en-IN"], ["dd-mm-yyyy", "#,##,###.##"]),
			("Germany", "EUR", ["dd.MM.yyyy", "de-DE"], ["dd.mm.yyyy", "#.###,##"]),
			("United States", "USD", ["MM-dd-yyyy", "en-US"], ["mm-dd-yyyy", "#,###.##"]),
		):
			with self.subTest(country=country), self.restored_system_settings():
				frappe.db.set_single_value("Books System Settings", "date_format", "MMM d, y")
				wizard = self._wizard(country=country, currency=currency)
				wizard.save(ignore_permissions=True)
				run_setup(wizard)

				books = frappe.db.get_value("Books System Settings", None, ["date_format", "locale"])
				self.assertEqual(books, books_formats)
				formats = frappe.db.get_value("System Settings", None, ["date_format", "number_format"])
				self.assertEqual(formats, frappe_formats)

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

	def test_preview_suggests_the_fiscal_year_that_holds_today(self):
		for today, country, year in (
			("2026-05-15", "Australia", ("2025-07-01", "2026-06-30")),
			("2026-07-01", "Australia", ("2026-07-01", "2027-06-30")),
			("2026-09-01", "Thailand", ("2025-10-01", "2026-09-30")),
			("2027-03-01", "South Africa", ("2027-03-01", "2028-02-29")),
		):
			with self.subTest(today=today, country=country), self.freeze_time(today):
				wizard = frappe.get_doc({"doctype": "Books Setup Wizard", "country": country})
				wizard.preview()
				self.assertEqual((str(wizard.fiscal_year_start), str(wizard.fiscal_year_end)), year)

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

	def test_only_a_system_manager_sets_up_books(self):
		frappe.db.set_single_value("Books Accounting Settings", "setup_complete", 0)
		with self.set_user(ensure_user("books-wizard-manager@example.com", "Books Manager")):
			self.assertRaises(frappe.PermissionError, complete_setup)
			self.assertRaises(frappe.PermissionError, self._wizard().save)

	def test_setup_completes_only_once(self):
		frappe.db.set_single_value("Books Accounting Settings", "setup_complete", 0)
		self._wizard().save()

		complete_setup()

		self.assertTrue(frappe.db.get_single_value("Books Accounting Settings", "setup_complete"))
		self.assertRaises(frappe.ValidationError, complete_setup)


class IntegrationTestCountryChartSetup(SetupWizardTestMixin, IntegrationTestCase):
	"""Country charts set up on a site without the standard chart, as a real site has one chart."""

	def test_setup_leaves_a_country_chart_ready_to_invoice(self):
		for country, currency, chart, accounts in (
			(
				"Switzerland",
				"CHF",
				"Switzerland - General Chart of Accounts",
				("1100-Trade Receivables (Debtors)", "2000-Trade Payables (Creditors)", "3200-Trade Revenue"),
			),
			# Its Sales account is a group, which no item can sell into.
			(
				"United Arab Emirates",
				"AED",
				"U.A.E - Chart of Accounts",
				("Trade Receivable", "Trade Payable", "Sales Account"),
			),
		):
			with self.subTest(chart=chart), self.restored_system_settings():
				wizard = self._wizard(country=country, currency=currency, chart_of_accounts=chart)
				wizard.save(ignore_permissions=True)
				run_setup(wizard)

				self.assertEqual(
					company_value(
						["default_receivable_account", "default_payable_account", "default_income_account"]
					),
					accounts,
				)
				self.assert_first_invoice_takes(accounts[0], accounts[2])
