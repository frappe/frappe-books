from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import getdate

from frappe_books.reports.dashboard import (
	get_cashflow,
	get_invoice_summary,
	get_period_dates,
	get_profit_and_loss,
	get_top_expenses,
)
from frappe_books.reports.financial_statements import get_account_balances
from frappe_books.tests.accounting import make_account
from frappe_books.ui_bridge.database import BooksDatabaseBridge

TODAY = "2031-12-15"
PERIODS = ("This Year", "This Quarter", "This Month", "YTD")


class IntegrationTestDashboard(IntegrationTestCase):
	def setUp(self):
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
			_post(account, debit, credit, date)

	def test_ledger_totals_are_grouped_by_account_and_month(self):
		with self.freeze_time(TODAY):
			expenses = get_top_expenses("This Year")
			cashflow = get_cashflow("This Year")
			profit = get_profit_and_loss("This Year")

		self.assertIn({"account": self.rent.name, "total": Decimal("50.00")}, expenses)
		self.assertEqual(
			cashflow["months"][:3],
			[
				{"yearmonth": "2031-01", "inflow": Decimal("0.00"), "outflow": Decimal("50.00")},
				{"yearmonth": "2031-02", "inflow": Decimal("80.00"), "outflow": Decimal("0.00")},
				{"yearmonth": "2031-03", "inflow": Decimal("0.00"), "outflow": Decimal("0.00")},
			],
		)
		self.assertTrue(cashflow["has_data"])
		self.assertEqual(
			[(month["yearmonth"], month["balance"]) for month in profit["months"][:3]],
			[("2031-01", Decimal("-50.00")), ("2031-02", Decimal("80.00")), ("2031-03", Decimal("0.00"))],
		)
		self.assertTrue(profit["has_data"])

	def test_outstanding_counts_credit_notes_as_positive_amounts(self):
		for total, outstanding, return_against in ((100, 40, None), (-30, -30, "Dashboard Original")):
			_invoice("2031-03-01", total, outstanding, return_against=return_against)

		with self.freeze_time(TODAY):
			summary = get_invoice_summary("Books Sales Invoice", "This Year")

		self.assertEqual(
			(summary["total"], summary["paid"], summary["unpaid"]),
			(Decimal("130.00"), Decimal("60.00"), Decimal("70.00")),
		)
		self.assertEqual((summary["paid_count"], summary["unpaid_count"]), (0, 2))


class IntegrationTestDashboardPeriods(IntegrationTestCase):
	def test_periods_end_today_and_start_on_the_first_of_a_month(self):
		with self.freeze_time("2031-09-30 18:00:00"):
			periods = {period: get_period_dates(period) for period in PERIODS}
			months = get_profit_and_loss("This Month")["months"]

		self.assertEqual(
			periods,
			{
				"This Year": _dates("2030-10-01", "2031-09-30"),
				"This Quarter": _dates("2031-07-01", "2031-09-30"),
				"This Month": _dates("2031-09-01", "2031-09-30"),
				"YTD": _dates("2031-01-01", "2031-09-30"),
			},
		)
		self.assertEqual([month["yearmonth"] for month in months], ["2031-09"])

	def test_invoices_dated_after_today_are_left_out(self):
		for date in ("2031-09-30 09:00:00", "2031-10-01 09:00:00"):
			_invoice(date, 100, 0)

		with self.freeze_time("2031-09-30 18:00:00"):
			summary = get_invoice_summary("Books Sales Invoice", "This Month")

		self.assertEqual((summary["paid_count"], summary["total"]), (1, Decimal("100.00")))


class IntegrationTestInvoiceDrillDown(IntegrationTestCase):
	def test_invoice_list_filters_select_the_invoices_the_summary_counts(self):
		_invoice("2031-09-10 09:00:00", 100, 0)
		_invoice("2031-09-11 09:00:00", 100, 100)
		_invoice("2031-09-12 09:00:00", 100, 0, docstatus=2)
		_invoice("2031-09-13 09:00:00", 100, 0, docstatus=0)
		_invoice("2031-08-31 09:00:00", 100, 0)

		with self.freeze_time("2031-09-30 18:00:00"):
			summary = get_invoice_summary("Books Sales Invoice", "This Month")

		self.assertEqual((summary["paid_count"], summary["unpaid_count"]), (1, 1))
		dates = [">=", str(summary["from_date"]), "<", str(summary["before_date"])]
		for operator, count in (("=", summary["paid_count"]), ("!=", summary["unpaid_count"])):
			# The filters the Paid and Unpaid buttons open the invoice list with.
			filters = {
				"submitted": ["=", 1],
				"cancelled": ["=", 0],
				"outstandingAmount": [operator, 0],
				"date": dates,
			}
			self.assertEqual(BooksDatabaseBridge().count("SalesInvoice", filters), count)


class IntegrationTestAccountBalances(IntegrationTestCase):
	def test_account_balances_are_kept_on_the_root_type_side(self):
		cash = make_account("Balance Cash", account_type="Cash")
		sales = make_account("Balance Sales", root_type="Income")
		_post(cash, 80, 0)
		_post(sales, 0, 80)
		_post(cash, 0, 50)

		result = get_account_balances()

		self.assertEqual(
			(result["balances"][cash.name], result["balances"][sales.name]), (Decimal(30), Decimal(80))
		)
		self.assertEqual(result["credit_root_types"], ["Equity", "Income", "Liability"])


def _post(account, debit, credit, date="2031-01-10"):
	frappe.get_doc(
		{
			"doctype": "Books Ledger Entry",
			"posting_date": date,
			"account": account.name,
			"debit": debit,
			"credit": credit,
		}
	).insert()


def _invoice(date, total, outstanding, **values):
	frappe.get_doc(
		{
			"doctype": "Books Sales Invoice",
			"name": frappe.generate_hash(),
			"date": date,
			"docstatus": 1,
			"base_grand_total": total,
			"outstanding_amount": outstanding,
			**values,
		}
	).db_insert()


def _dates(*dates):
	return tuple(getdate(date) for date in dates)
