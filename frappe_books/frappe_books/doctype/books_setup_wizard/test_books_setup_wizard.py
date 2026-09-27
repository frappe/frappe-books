# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.coa import STANDARD_CHART, chart_options, load_chart
from frappe_books.frappe_books.doctype.books_setup_wizard.books_setup_wizard import complete_setup
from frappe_books.setup_service import run_setup
from frappe_books.tests.accounting import unique_name


class IntegrationTestBooksSetupWizard(IntegrationTestCase):
	def test_rejects_invalid_fiscal_year(self):
		wizard = self._wizard(fiscal_year_start="2027-04-01", fiscal_year_end="2027-03-31")
		with self.assertRaises(frappe.ValidationError):
			wizard.save(ignore_permissions=True)

	def test_setup_creates_standard_accounts_and_defaults(self):
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
		self.assertTrue(frappe.db.exists("Books Currency", "INR"))
		self.assertTrue(frappe.db.exists("Books Account", "CGST"))
		self.assertTrue(frappe.db.exists("Books Tax", "GST-18"))
		gst = frappe.get_doc("Books Tax", "GST-18")
		self.assertEqual([(row.account, row.rate) for row in gst.details], [("CGST", 9), ("SGST", 9)])

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
		self.assertTrue(frappe.db.exists("Books Account", "CGST"))

	def test_setup_adapts_defaults_to_a_numbered_chart(self):
		wizard = self._wizard(country="Guatemala", currency="GTQ", chart_of_accounts="Guatemala - Cuentas")
		wizard.save(ignore_permissions=True)
		run_setup(wizard)

		self.assertTrue(frappe.db.exists("Books Account", "Caja - 1.9.1"))
		self.assertEqual(
			frappe.db.get_value("Books Account", wizard.bank_name, "parent_books_account"),
			"Caja y Equivalentes - 1.9",
		)
		self.assertEqual(frappe.db.get_single_value("Books Pos Settings", "cash_account"), "Caja - 1.9.1")
		self.assertEqual(
			frappe.db.get_single_value("Books Pos Settings", "default_account"),
			"Activos bajo Contrato - 1.8.2",
		)
		self.assertEqual(frappe.db.get_value("Books Account", "Discounts", "root_type"), "Income")
		self.assertFalse(frappe.db.get_single_value("Books Accounting Settings", "write_off_account"))
		# The chart has no postable round-off or stock account, only groups or other types.
		self.assertFalse(frappe.db.get_single_value("Books Accounting Settings", "round_off_account"))
		self.assertFalse(frappe.db.get_single_value("Books Inventory Settings", "stock_in_hand"))

	def test_setup_offers_every_shipped_chart_and_rejects_others(self):
		charts = {chart["name"]: chart for chart in chart_options()}
		self.assertEqual(chart_options()[0]["name"], STANDARD_CHART)
		self.assertEqual(charts["Canada - Plan comptable pour les provinces francophones"]["language"], "fr")
		self.assertEqual(charts["Switzerland - General Chart of Accounts"]["country_code"], "ch")
		for name in charts:
			with self.subTest(chart=name):
				self.assertTrue(load_chart(name))
		self.assertRaisesRegex(frappe.ValidationError, "Unknown chart of accounts", load_chart, "Standard")

	def test_setup_completes_only_once(self):
		frappe.db.set_single_value("Books Accounting Settings", "setup_complete", 0)
		self._wizard().save()

		complete_setup()

		self.assertTrue(frappe.db.get_single_value("Books Accounting Settings", "setup_complete"))
		self.assertRaises(frappe.ValidationError, complete_setup)

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
