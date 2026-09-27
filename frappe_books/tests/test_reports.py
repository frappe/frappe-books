from decimal import Decimal
from itertools import pairwise
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, now_datetime, nowdate

from frappe_books.reports import gst
from frappe_books.tests.accounting import make_account, make_item, make_party, unique_name
from frappe_books.tests.test_valuation import move
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


class IntegrationTestStockReports(IntegrationTestCase):
	def setUp(self):
		self.queries = BooksBespokeQueries()
		income = make_account("Stock Report Income", root_type="Income")
		expense = make_account("Stock Report Expense", root_type="Expense")
		self.item = make_item(income.name, expense.name, track_item=1).name
		now = now_datetime()
		move(self.item, "MaterialReceipt", 4, 10, add_to_date(now, days=-3))
		move(self.item, "MaterialReceipt", 2, 20, add_to_date(now, days=-2))
		move(self.item, "MaterialIssue", 5, 99, now)

	def test_stock_ledger_reads_the_stored_fifo_balances(self):
		rows = self.queries.call("getStockLedger", [{"item": self.item, "ascending": True}])

		columns = (
			"quantity",
			"balanceQuantity",
			"valueChange",
			"balanceValue",
			"incomingRate",
			"valuationRate",
		)
		self.assertEqual(
			[tuple(row[column] for column in columns) for row in rows],
			[
				_decimals(4, 4, 40, 40, 10, 10),
				_decimals(2, 6, 40, 80, 20, "13.33"),
				_decimals(-5, 1, -60, 20, 12, 20),
			],
		)

	def test_stock_ledger_dates_are_iso_datetimes(self):
		rows = self.queries.call("getStockLedger", [{"item": self.item}])

		for row in rows:
			self.assertRegex(row["date"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$")

	def test_stock_balance_splits_opening_and_period_movement(self):
		today = nowdate()
		rows = self.queries.call("getStockBalance", [{"item": self.item, "fromDate": today, "toDate": today}])

		self.assertEqual(len(rows), 1)
		columns = ("openingQuantity", "openingValue", "outgoingQuantity", "outgoingValue", "balanceValue")
		self.assertEqual(tuple(rows[0][column] for column in columns), _decimals(6, 80, 5, 60, 20))
		self.assertEqual((rows[0]["balanceQuantity"], rows[0]["valuationRate"]), _decimals(1, 20))


class IntegrationTestGSTR(IntegrationTestCase):
	def setUp(self):
		self.queries = BooksBespokeQueries()
		for account in ("CGST", "SGST", "IGST"):
			if not frappe.db.exists("Books Account", account):
				frappe.get_doc(
					{"doctype": "Books Account", "account_name": account, "root_type": "Liability"}
				).insert()
		self.receivable = make_account("GSTR Receivable", account_type="Receivable")
		self.income = make_account("GSTR Income", root_type="Income", account_type="Income Account")
		expense = make_account("GSTR Expense", root_type="Expense", account_type="Expense Account")
		self.party = make_party(self.receivable.name)
		self.item = make_item(self.income.name, expense.name).name

	def test_mixed_rates_give_one_row_per_rate(self):
		gst_18 = _tax(("CGST", 9), ("SGST", 9))
		gst_5 = _tax(("CGST", 2.5), ("SGST", 2.5))
		invoice = self._invoice((gst_18, 100, 1), (gst_5, 50, 2), (gst_18, 200, 1))

		rows = self._rows(invoice)

		self.assertEqual(
			{(row["rate"], row["taxVal"], row["cgstAmt"], row["sgstAmt"]) for row in rows},
			{_decimals(18, 300, 27, 27), _decimals(5, 100, "2.5", "2.5")},
		)
		self.assertTrue(all(row["invAmt"] == Decimal(459) for row in rows))

	def test_invoice_dates_are_iso_dates(self):
		invoice = self._invoice((_tax(("IGST", 18)), 100, 1))

		(row,) = self._rows(invoice)

		self.assertEqual(row["invDate"], nowdate())

	def test_igst_rows_are_interstate(self):
		invoice = self._invoice((_tax(("IGST", 18)), 100, 1))

		(row,) = self._rows(invoice)

		self.assertEqual((row["rate"], row["igstAmt"], row["inState"]), (*_decimals(18, 18), False))
		self.assertNotIn("cgstAmt", row)

	def test_invoices_and_parties_are_read_in_batches(self):
		gst_18 = _tax(("CGST", 9), ("SGST", 9))
		first = self._invoice((gst_18, 100, 1))
		self.party = make_party(self.receivable.name)
		second = self._invoice((gst_18, 200, 1))

		with patch.object(gst, "IN_LIST_BATCH_SIZE", 1):
			rows = [*self._rows(first), *self._rows(second)]

		self.assertEqual(
			[(row["invNo"], row["partyName"], row["taxVal"]) for row in rows],
			[(first.name, first.party, Decimal(100)), (second.name, second.party, Decimal(200))],
		)

	def _invoice(self, *rows):
		return (
			frappe.get_doc(
				{
					"doctype": "Books Sales Invoice",
					"party": self.party.name,
					"account": self.receivable.name,
					"date": now_datetime(),
					"items": [
						{
							"item": self.item,
							"account": self.income.name,
							"tax": tax,
							"rate": rate,
							"quantity": quantity,
						}
						for tax, rate, quantity in rows
					],
				}
			)
			.insert()
			.submit()
		)

	def _rows(self, invoice):
		today = nowdate()
		rows = self.queries.call("getGSTRRows", ["SalesInvoice", {"fromDate": today, "toDate": today}])
		return [row for row in rows if row["invNo"] == invoice.name]


def _tax(*details):
	return (
		frappe.get_doc(
			{
				"doctype": "Books Tax",
				"name": unique_name("GST"),
				"details": [{"account": account, "rate": rate} for account, rate in details],
			}
		)
		.insert()
		.name
	)


def _decimals(*values):
	return tuple(Decimal(str(value)) for value in values)
