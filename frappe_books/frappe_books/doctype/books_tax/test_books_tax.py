# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account, make_tax, root_group


class IntegrationTestBooksTax(IntegrationTestCase):
	def test_tax_rows_take_ledger_accounts_only(self):
		group = root_group("Liability")
		ledger = make_account("Output Tax", root_type="Liability", account_type="Tax").name
		self.assertRaisesRegex(frappe.ValidationError, "Group account", make_tax, group)

		tax = make_tax(ledger)
		tax.details[0].payment_account = group
		self.assertRaisesRegex(frappe.ValidationError, "Group account", tax.save)
