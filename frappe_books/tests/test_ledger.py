from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import nowdate

from frappe_books.accounting.ledger import LedgerPosting
from frappe_books.tests.accounting import make_account


class IntegrationTestLedgerPosting(IntegrationTestCase):
	def setUp(self):
		self.cash = make_account("Ledger Cash", account_type="Cash")
		self.income = make_account("Ledger Income", root_type="Income")
		round_off = make_account("Ledger Round Off", root_type="Expense")
		frappe.db.set_single_value("Books Accounting Settings", "round_off_account", round_off.name)
		self.voucher = frappe._dict(doctype="Books Journal Entry", name="JV-TEST", posting_date=nowdate())

	def test_rejects_gap_larger_than_rounding(self):
		posting = LedgerPosting(self.voucher)
		posting.debit(self.cash.name, Decimal("10"))
		posting.credit(self.income.name, Decimal("9.50"))

		with self.assertRaisesRegex(frappe.ValidationError, "must equal total credit"):
			posting.post()
