from decimal import Decimal
from itertools import pairwise

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account, unique_name
from frappe_books.ui_bridge.bespoke import BooksBespokeQueries

VOUCHER = "Books Journal Entry"


class IntegrationTestLedgerReports(IntegrationTestCase):
	def setUp(self):
		self.queries = BooksBespokeQueries()
		self.assets = _group_account("Report Assets", "Asset")
		self.cash = _account("Report Cash", "Asset", self.assets)
		self.sales = make_account("Report Sales", root_type="Income")
		self.rent = make_account("Report Rent", root_type="Expense")

	def test_general_ledger_carries_the_opening_into_running_balances(self):
		for date, debit, credit in (("2044-12-31", 100, 0), ("2045-01-05", 50, 0), ("2045-01-20", 0, 20)):
			_post(date, self.cash.name, debit, credit)
		for ascending in (True, False):
			rows = self._ledger(account=self.cash.name, ascending=ascending)
			entries = [row for row in rows if row["type"] == "entry"]
			self.assertEqual(rows[0], _row("opening", 0, 0, 100))
			self.assertEqual(
				sorted((row["date"].isoformat(), row["balance"]) for row in entries),
				[("2045-01-05", Decimal(150)), ("2045-01-20", Decimal(130))],
			)
			self.assertEqual(entries[0]["date"].isoformat(), "2045-01-05" if ascending else "2045-01-20")
			self.assertEqual(rows[-2:], [{"type": "blank"}, _row("closing", 50, 20, 130)])

	def test_general_ledger_groups_include_accounts_with_only_an_opening(self):
		voucher = unique_name("JV")
		_post("2044-12-31", self.cash.name, 100, 0, voucher)
		_post("2044-12-31", self.sales.name, 0, 100, voucher)
		_post("2045-01-01", self.cash.name, 20, 0, voucher)

		rows = self._ledger(referenceName=voucher, groupBy="account", ascending=True)

		totals = [row["balance"] for row in rows if row["type"] == "total"]
		self.assertEqual(totals, [Decimal(120), Decimal(-100)])
		self.assertEqual(
			[row["account"] for row in rows if row["type"] == "opening"], [self.cash.name, self.sales.name]
		)
		self.assertEqual(rows[-1], _row("closing", 20, 0, 20))

	def test_trial_balance_splits_opening_and_closing_balances(self):
		for date, debit, credit in (
			("2044-12-31", 100, 20),
			("2045-01-01", 50, 0),
			("2045-01-31", 0, 30),
			("2045-02-01", 999, 0),
		):
			_post(date, self.cash.name, debit, credit)

		sections = self.queries.call("getTrialBalance", ["2045-01-01", "2045-02-01"])["sections"]

		rows = _rows_by_account(sections)
		expected = [Decimal(value) for value in (80, 0, 50, 30, 100, 0)]
		self.assertEqual(rows[self.cash.name]["values"], expected)
		self.assertEqual(rows[self.assets.name]["values"], expected)
		self.assertEqual((rows[self.assets.name]["level"], rows[self.cash.name]["level"]), (0, 1))

	def test_profit_and_loss_shows_each_period_and_the_profit(self):
		_post("2045-02-01", self.sales.name, 0, 100)
		_post("2045-03-01", self.rent.name, 30, 0)
		_post("2046-02-01", self.sales.name, 0, 200)

		report = self.queries.call("getProfitAndLoss", [_periods("2045-01-01", "2046-01-01", "2047-01-01")])

		rows = _rows_by_account(report["sections"])
		self.assertEqual(rows[self.sales.name]["values"], [Decimal(100), Decimal(200)])
		self.assertEqual(rows[self.rent.name]["values"], [Decimal(30), Decimal(0)])
		self.assertEqual(report["profit"], [Decimal(70), Decimal(200)])

	def test_balance_sheet_accumulates_from_the_first_entry(self):
		for date, debit, credit in (
			("2044-01-01", 100, 0),
			("2045-01-01", 50, 0),
			("2046-01-01", 0, 20),
			("2047-01-01", 999, 0),
		):
			_post(date, self.cash.name, debit, credit)

		report = self.queries.call("getBalanceSheet", [_periods("2045-01-01", "2046-01-01", "2047-01-01")])

		rows = _rows_by_account(report["sections"])
		self.assertEqual(rows[self.cash.name]["values"], [Decimal(150), Decimal(130)])
		self.assertEqual(rows[self.assets.name]["values"], [Decimal(150), Decimal(130)])

	def test_ledger_reports_need_ledger_read_permission(self):
		with self.set_user("Guest"), self.assertRaises(frappe.PermissionError):
			self._ledger()

	def _ledger(self, **filters):
		return self.queries.call(
			"getGeneralLedger", [{"fromDate": "2045-01-01", "toDate": "2045-01-31", **filters}]
		)


def _group_account(label, root_type):
	return _account(label, root_type, is_group=1)


def _account(label, root_type, parent=None, is_group=0):
	return frappe.get_doc(
		{
			"doctype": "Books Account",
			"account_name": unique_name(label),
			"root_type": root_type,
			"is_group": is_group,
			"parent_books_account": parent.name if parent else None,
		}
	).insert()


def _post(date, account, debit, credit, voucher=None):
	frappe.get_doc(
		{
			"doctype": "Books Ledger Entry",
			"posting_date": date,
			"account": account,
			"debit": debit,
			"credit": credit,
			"voucher_type": VOUCHER,
			"voucher_no": voucher or unique_name("JV"),
		}
	).insert(ignore_links=True)


def _row(row_type, debit, credit, balance):
	return {"type": row_type, "debit": Decimal(debit), "credit": Decimal(credit), "balance": Decimal(balance)}


def _periods(*dates):
	return [{"fromDate": start, "toDate": end} for start, end in pairwise(dates)]


def _rows_by_account(sections):
	return {row["name"]: row for section in sections for row in section["accounts"]}
