# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.accounting.accounts import mode_of_payment_account
from frappe_books.company import default_company
from frappe_books.tests.accounting import make_account, make_mode_of_payment


class IntegrationTestBooksModeofPayment(IntegrationTestCase):
	def test_account_suits_the_mode_type(self):
		cash = make_account("Method Cash", account_type="Cash").name
		bank = make_account("Method Bank", account_type="Bank").name
		income = make_account("Method Income", root_type="Income", account_type="Income Account").name
		for mode_type, account, message in (
			("Cash", bank, "must be of type Cash, but"),
			("Bank", income, "must be of type Cash or Bank"),
			("Cash", cash, None),
			("Bank", bank, None),
			("Bank", cash, None),
		):
			with self.subTest(mode_type=mode_type, account=account):
				if message:
					self.assertRaisesRegex(
						frappe.ValidationError, message, make_mode_of_payment, mode_type, mode_type, account
					)
				else:
					make_mode_of_payment(mode_type, mode_type, account)

	def test_a_mode_has_one_account_per_company(self):
		bank = make_account("Mode Bank", account_type="Bank").name
		mode = make_mode_of_payment("Card", account=bank)

		self.assertEqual(mode.accounts[0].company, default_company())
		self.assertEqual(mode_of_payment_account(mode.name), bank)
		mode.append("accounts", {"default_account": bank})
		self.assertRaisesRegex(frappe.ValidationError, "Same Company", mode.save)
