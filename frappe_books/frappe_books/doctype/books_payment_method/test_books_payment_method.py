# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account, unique_name


class IntegrationTestBooksPaymentMethod(IntegrationTestCase):
	def test_account_suits_the_method_type(self):
		cash = make_account("Method Cash", account_type="Cash").name
		bank = make_account("Method Bank", account_type="Bank").name
		income = make_account("Method Income", root_type="Income", account_type="Income Account").name
		for method_type, account, message in (
			("Cash", bank, "must be of type Cash, but"),
			("Bank", income, "must be of type Cash or Bank"),
			("Cash", cash, None),
			("Bank", bank, None),
			("Bank", cash, None),
		):
			with self.subTest(method_type=method_type, account=account):
				method = frappe.get_doc(
					{
						"doctype": "Books Payment Method",
						"name": unique_name(method_type),
						"type": method_type,
						"account": account,
					}
				)
				if message:
					self.assertRaisesRegex(frappe.ValidationError, message, method.insert)
				else:
					method.insert()
