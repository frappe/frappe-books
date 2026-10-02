import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account


class IntegrationTestSettingsAccounts(IntegrationTestCase):
	def test_settings_reject_accounts_of_the_wrong_type(self):
		cash = make_account("Settings Cash", account_type="Cash").name
		receivable = make_account("Settings Receivable", account_type="Receivable").name
		for doctype, fieldname, account in (
			("Books Accounting Settings", "discount_account", cash),
			("Books Inventory Settings", "stock_in_hand", cash),
			("Books Inventory Settings", "stock_adjustment", cash),
			("Books Pos Settings", "cash_account", receivable),
			("Books Pos Settings", "write_off_account", cash),
			("Books Pos Settings", "default_account", cash),
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
			("Books Pos Settings", "cash_account"),
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
		settings = frappe.get_single(doctype)
		settings.set(fieldname, account)
		# A test site skips the setup wizard that fills the company details.
		settings.flags.ignore_mandatory = True
		settings.save()
