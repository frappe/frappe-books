import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account


class IntegrationTestSettingsAccounts(IntegrationTestCase):
	def test_settings_reject_accounts_of_the_wrong_type(self):
		cash = make_account("Settings Cash", account_type="Cash")
		for doctype, fieldname in (
			("Books Accounting Settings", "discount_account"),
			("Books Inventory Settings", "stock_in_hand"),
		):
			settings = frappe.get_single(doctype)
			settings.set(fieldname, cash.name)
			# A test site skips the setup wizard that fills the company details.
			settings.flags.ignore_mandatory = True
			with self.subTest(fieldname=fieldname):
				self.assertRaisesRegex(frappe.ValidationError, "must be of type", settings.save)
