from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account
from frappe_books.ui_bridge.bespoke import BooksBespokeQueries

DATES = ["2031-01-01", "2031-12-31"]


class IntegrationTestDashboard(IntegrationTestCase):
	def setUp(self):
		self.queries = BooksBespokeQueries()
		self.cash = make_account("Dashboard Cash", account_type="Cash")
		self.rent = make_account("Dashboard Rent", root_type="Expense")
		self.sales = make_account("Dashboard Sales", root_type="Income")
		for date, account, debit, credit in (
			("2031-01-10", self.rent, 30, 0),
			("2031-01-20", self.rent, 20, 0),
			("2031-01-20", self.cash, 0, 50),
			("2031-02-05", self.cash, 80, 0),
			("2031-02-05", self.sales, 0, 80),
		):
			frappe.get_doc(
				{
					"doctype": "Books Ledger Entry",
					"posting_date": date,
					"account": account.name,
					"debit": debit,
					"credit": credit,
				}
			).insert()

	def test_ledger_totals_are_grouped_by_account_and_month(self):
		self.assertIn({"account": self.rent.name, "total": Decimal("50.00")}, self._call("getTopExpenses"))
		self.assertEqual(
			self._call("getCashflow"),
			[
				{"yearmonth": "2031-01", "inflow": Decimal("0.00"), "outflow": Decimal("50.00")},
				{"yearmonth": "2031-02", "inflow": Decimal("80.00"), "outflow": Decimal("0.00")},
			],
		)
		self.assertEqual(
			self._call("getIncomeAndExpenses"),
			{
				"income": [{"yearmonth": "2031-02", "balance": Decimal("80.00")}],
				"expense": [{"yearmonth": "2031-01", "balance": Decimal("50.00")}],
			},
		)
		self.assertIn(
			{"account": self.cash.name, "totalCredit": Decimal("50.00"), "totalDebit": Decimal("80.00")},
			self.queries.call("getTotalCreditAndDebit", []),
		)

	def test_outstanding_counts_credit_notes_as_positive_amounts(self):
		for total, outstanding, return_against in ((100, 40, None), (-30, -30, "Dashboard Original")):
			frappe.get_doc(
				{
					"doctype": "Books Sales Invoice",
					"name": frappe.generate_hash(),
					"date": "2031-03-01",
					"docstatus": 1,
					"base_grand_total": total,
					"outstanding_amount": outstanding,
					"return_against": return_against,
				}
			).db_insert()

		self.assertEqual(
			self.queries.call("getTotalOutstanding", ["SalesInvoice", *DATES]),
			{"total": Decimal("130.00"), "outstanding": Decimal("70.00")},
		)

	def _call(self, method):
		return self.queries.call(method, DATES)
