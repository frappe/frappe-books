import json

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.accounting.accounts import DASHBOARD_ROOT_TYPES
from frappe_books.company import default_company
from frappe_books.tests.accounting import make_account

SETTINGS = "Books Accounting Settings"


class IntegrationTestSettingsAccounts(IntegrationTestCase):
	def test_settings_reject_accounts_of_the_wrong_type(self):
		cash = make_account("Settings Cash", account_type="Cash").name
		receivable = make_account("Settings Receivable", account_type="Receivable").name
		for doctype, fieldname, account in (
			("Books Company", "default_discount_account", cash),
			("Books Company", "default_inventory_account", cash),
			("Books Company", "stock_adjustment_account", cash),
			("Books POS Settings", "cash_account", receivable),
			("Books POS Settings", "write_off_account", cash),
			("Books POS Settings", "default_account", cash),
			("Books Defaults", "sales_payment_account", receivable),
			("Books Defaults", "purchase_payment_account", receivable),
		):
			with self.subTest(fieldname=fieldname):
				self.assertRaisesRegex(
					frappe.ValidationError, "must be of type", self.save, doctype, fieldname, account
				)

	def test_settings_reject_group_accounts(self):
		group = make_account("Settings Cash Group", account_type="Cash", is_group=1).name
		for doctype, fieldname in (
			("Books POS Settings", "cash_account"),
			("Books Defaults", "sales_payment_account"),
		):
			with self.subTest(fieldname=fieldname):
				self.assertRaisesRegex(
					frappe.ValidationError, "group account", self.save, doctype, fieldname, group
				)

	def test_payment_defaults_take_cash_or_bank_accounts(self):
		for account_type in ("Cash", "Bank"):
			account = make_account(f"Settings {account_type}", account_type=account_type).name
			for fieldname in ("sales_payment_account", "purchase_payment_account"):
				with self.subTest(account_type=account_type, fieldname=fieldname):
					self.save("Books Defaults", fieldname, account)

	def save(self, doctype, fieldname, account):
		settings = frappe.get_doc(doctype, default_company() if doctype == "Books Company" else doctype)
		settings.set(fieldname, account)
		# A test site skips the setup wizard that fills the company details.
		settings.flags.ignore_mandatory = True
		settings.save()


class IntegrationTestDashboardAccountRules(IntegrationTestCase):
	def setUp(self):
		self.bank = make_account("Dashboard Rule Bank", account_type="Bank").name
		self.loan = make_account("Dashboard Rule Loan", root_type="Liability").name
		self.addCleanup(frappe.db.delete, "Books Dashboard Account", {"parenttype": SETTINGS})

	def test_leaf_asset_and_liability_accounts_can_be_picked(self):
		settings = self.save_picks([self.bank, self.loan])
		self.assertEqual([row.account for row in settings.dashboard_accounts], [self.bank, self.loan])

	def test_an_account_is_picked_only_once(self):
		self.assertRaisesRegex(
			frappe.ValidationError, "more than once", self.save_picks, [self.bank, self.loan, self.bank]
		)

	def test_group_and_other_root_type_accounts_cannot_be_picked(self):
		group = make_account("Dashboard Rule Group", is_group=1).name
		income = make_account("Dashboard Rule Income", root_type="Income").name
		for account, message in ((group, "group account"), (income, "must be of type")):
			with self.subTest(account=account):
				self.assertRaisesRegex(frappe.ValidationError, message, self.save_picks, [account])

	def test_a_saved_pick_that_stopped_qualifying_does_not_block_other_settings(self):
		settings = self.save_picks([self.bank])
		frappe.db.set_value("Books Account", self.bank, "is_group", 1)

		settings.enable_partial_payment = int(not settings.enable_partial_payment)
		self.save_settings(settings)

		income = make_account("Dashboard Rule Income", root_type="Income").name
		settings.dashboard_accounts[0].account = income
		self.assertRaisesRegex(frappe.ValidationError, "must be of type", self.save_settings, settings)

	def test_a_row_moved_onto_a_stale_account_is_checked(self):
		settings = self.save_picks([self.bank, self.loan])
		frappe.db.set_value("Books Account", self.bank, "is_group", 1)

		# The stale account was on the table before, but not on the row that now holds it.
		settings.remove(settings.dashboard_accounts[0])
		settings.dashboard_accounts[0].account = self.bank
		self.assertRaisesRegex(frappe.ValidationError, "group account", self.save_settings, settings)

	def test_the_picker_filters_mirror_the_allowed_root_types(self):
		field = frappe.get_meta("Books Dashboard Account").get_field("account")
		filters = {
			(fieldname, operator): value for _, fieldname, operator, value in json.loads(field.link_filters)
		}
		self.assertEqual(filters, {("is_group", "="): 0, ("root_type", "in"): list(DASHBOARD_ROOT_TYPES)})

	def save_picks(self, accounts):
		settings = frappe.get_single(SETTINGS)
		settings.set("dashboard_accounts", [{"account": account} for account in accounts])
		return self.save_settings(settings)

	def save_settings(self, settings):
		# A test site skips the setup wizard that fills the company details.
		settings.flags.ignore_mandatory = True
		settings.save()
		return settings
