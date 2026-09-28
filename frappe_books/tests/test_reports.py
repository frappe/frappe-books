from decimal import Decimal
from unittest.mock import patch

import frappe
from frappe.desk.query_report import run
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, add_years, getdate, now_datetime, nowdate

from frappe_books.reports import gst
from frappe_books.reports.filters import get_default_filters
from frappe_books.reports.financial_statements import TRIAL_BALANCE_KEYS
from frappe_books.tests.accounting import make_account, make_item, make_party, unique_name
from frappe_books.tests.test_valuation import move

VOUCHER = "Books Journal Entry"
YEARS_2045_AND_2046 = {"based_on": "Until Date", "periodicity": "Yearly", "count": 2, "to_date": "2046-12-31"}
PERIOD_KEYS = ("period_2046_12_31", "period_2045_12_31")


class IntegrationTestLedgerReports(IntegrationTestCase):
	def setUp(self):
		self.assets = _group_account("Report Assets", "Asset")
		self.cash = _account("Report Cash", "Asset", self.assets)
		self.sales = make_account("Report Sales", root_type="Income")
		self.rent = make_account("Report Rent", root_type="Expense")

	def test_general_ledger_carries_the_opening_into_running_balances(self):
		for date, debit, credit in (("2044-12-31", 100, 0), ("2045-01-05", 50, 0), ("2045-01-20", 0, 20)):
			_post(date, self.cash.name, debit, credit)
		for ascending in (True, False):
			rows = self._ledger(account=self.cash.name, ascending=ascending)
			entries = [row for row in rows if row.get("type") == "entry"]
			self.assertEqual(rows[0], _row("opening", "Opening", 0, 0, 100))
			self.assertEqual(
				sorted((row["date"].isoformat(), row["balance"]) for row in entries),
				[("2045-01-05", Decimal(150)), ("2045-01-20", Decimal(130))],
			)
			self.assertEqual(entries[0]["date"].isoformat(), "2045-01-05" if ascending else "2045-01-20")
			self.assertEqual(rows[-2:], [{}, _row("closing", "Closing", 50, 20, 130)])

	def test_general_ledger_groups_include_accounts_with_only_an_opening(self):
		voucher = unique_name("JV")
		_post("2044-12-31", self.cash.name, 100, 0, voucher)
		_post("2044-12-31", self.sales.name, 0, 100, voucher)
		_post("2045-01-01", self.cash.name, 20, 0, voucher)

		rows = self._ledger(reference_name=voucher, group_by="account", ascending=True)

		totals = [row["balance"] for row in rows if row.get("type") == "total"]
		self.assertEqual(totals, [Decimal(120), Decimal(-100)])
		self.assertEqual(
			[row["account"] for row in rows if row.get("type") == "opening"],
			[f"Opening: {self.cash.name}", f"Opening: {self.sales.name}"],
		)
		self.assertEqual(rows[-1], _row("closing", "Closing", 20, 0, 20))

	def test_trial_balance_splits_opening_and_closing_balances(self):
		for date, debit, credit in (
			("2044-12-31", 100, 20),
			("2045-01-01", 50, 0),
			("2045-01-31", 0, 30),
			("2045-02-01", 999, 0),
		):
			_post(date, self.cash.name, debit, credit)

		rows = _rows_by_account(_run("Books Trial Balance", from_date="2045-01-01", to_date="2045-01-31"))

		expected = _decimals(80, 0, 50, 30, 100, 0)
		self.assertEqual(_values(rows[self.cash.name], TRIAL_BALANCE_KEYS), expected)
		self.assertEqual(_values(rows[self.assets.name], TRIAL_BALANCE_KEYS), expected)
		self.assertEqual((rows[self.assets.name]["indent"], rows[self.cash.name]["indent"]), (0, 1))

	def test_profit_and_loss_shows_each_period_and_the_profit(self):
		_post("2045-02-01", self.sales.name, 0, 100)
		_post("2045-03-01", self.rent.name, 30, 0)
		_post("2046-02-01", self.sales.name, 0, 200)

		rows = _run("Books Profit and Loss", **YEARS_2045_AND_2046)

		accounts = _rows_by_account(rows)
		self.assertEqual(_values(accounts[self.sales.name], PERIOD_KEYS), _decimals(200, 100))
		self.assertEqual(_values(accounts[self.rent.name], PERIOD_KEYS), _decimals(0, 30))
		self.assertEqual(_values(rows[-1], PERIOD_KEYS), _decimals(200, 70))
		self.assertEqual(rows[-1]["account"], "Total Profit")

	def test_balance_sheet_accumulates_from_the_first_entry(self):
		for date, debit, credit in (
			("2044-01-01", 100, 0),
			("2045-01-01", 50, 0),
			("2046-01-01", 0, 20),
			("2047-01-01", 999, 0),
		):
			_post(date, self.cash.name, debit, credit)

		rows = _rows_by_account(_run("Books Balance Sheet", **YEARS_2045_AND_2046))

		self.assertEqual(_values(rows[self.cash.name], PERIOD_KEYS), _decimals(130, 150))
		self.assertEqual(_values(rows[self.assets.name], PERIOD_KEYS), _decimals(130, 150))

	def test_ledger_reports_need_ledger_read_permission(self):
		with self.set_user("Guest"), self.assertRaises(frappe.PermissionError):
			self._ledger()

	def _ledger(self, **filters):
		return _run("Books General Ledger", from_date="2045-01-01", to_date="2045-01-31", **filters)


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


def _row(row_type, account, debit, credit, balance):
	return {
		"type": row_type,
		"account": account,
		"debit": Decimal(debit),
		"credit": Decimal(credit),
		"balance": Decimal(balance),
	}


def _run(report_name, **filters):
	return run(report_name, filters)["result"]


def _rows_by_account(rows):
	return {row["account"]: row for row in rows if row}


def _values(row, keys):
	return tuple(row[key] for key in keys)


class IntegrationTestReportDefaults(IntegrationTestCase):
	def test_ledgers_open_on_the_year_up_to_today(self):
		today = getdate()
		for report in ("Books General Ledger", "Books Stock Ledger", "Books Stock Balance"):
			self.assertEqual(
				get_default_filters(report), {"from_date": add_years(today, -1), "to_date": today}
			)

	def test_default_filters_need_report_access(self):
		with self.set_user("Guest"), self.assertRaises(frappe.PermissionError):
			get_default_filters("Books General Ledger")


class IntegrationTestStockReports(IntegrationTestCase):
	def setUp(self):
		self.income = make_account("Stock Report Income", root_type="Income")
		self.received = make_account("Stock Report Received", root_type="Liability")
		self.item = self._item()
		now = now_datetime()
		move(self.item, "MaterialReceipt", 4, 10, add_to_date(now, days=-3))
		move(self.item, "MaterialReceipt", 2, 20, add_to_date(now, days=-2))
		move(self.item, "MaterialIssue", 5, 99, now)

	def test_stock_ledger_reads_the_stored_fifo_balances(self):
		rows = _run("Books Stock Ledger", item=self.item, ascending=True)

		columns = (
			"quantity",
			"balance_quantity",
			"value_change",
			"balance_value",
			"incoming_rate",
			"valuation_rate",
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
		rows = _run("Books Stock Ledger", item=self.item)

		for row in rows:
			self.assertRegex(row["date"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$")

	def test_stock_ledger_groups_rows_and_numbers_them_in_order(self):
		other = self._item()
		for item, day in ((self.item, 1), (other, 2), (self.item, 3)):
			move(item, "MaterialReceipt", 1, 10, f"2061-01-0{day} 10:00:00")

		rows = _run(
			"Books Stock Ledger",
			from_date="2061-01-01",
			to_date="2061-01-03",
			group_by="item",
			ascending=True,
		)

		self.assertEqual(
			[(row.get("index"), row.get("item")) for row in rows],
			[(1, self.item), (2, self.item), (None, None), (3, other)],
		)

	def test_stock_balance_splits_opening_and_period_movement(self):
		today = nowdate()
		rows = _run("Books Stock Balance", item=self.item, from_date=today, to_date=today)

		self.assertEqual(len(rows), 1)
		columns = (
			"opening_quantity",
			"opening_value",
			"outgoing_quantity",
			"outgoing_value",
			"balance_value",
		)
		self.assertEqual(tuple(rows[0][column] for column in columns), _decimals(6, 80, 5, 60, 20))
		self.assertEqual((rows[0]["balance_quantity"], rows[0]["valuation_rate"]), _decimals(1, 20))

	def _item(self):
		return make_item(self.income.name, self.received.name, track_item=1).name


class IntegrationTestGSTR(IntegrationTestCase):
	def setUp(self):
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
			{(row["rate"], row["taxable_value"], row["cgst_amount"], row["sgst_amount"]) for row in rows},
			{_decimals(18, 300, 27, 27), _decimals(5, 100, "2.5", "2.5")},
		)
		self.assertTrue(all(row["invoice_value"] == Decimal(459) for row in rows))

	def test_invoice_dates_are_dates(self):
		invoice = self._invoice((_tax(("IGST", 18)), 100, 1))

		(row,) = self._rows(invoice)

		self.assertEqual(row["invoice_date"], getdate())

	def test_igst_rows_are_interstate(self):
		invoice = self._invoice((_tax(("IGST", 18)), 100, 1))

		(row,) = self._rows(invoice)

		self.assertEqual((row["rate"], row["igst_amount"], row["in_state"]), (*_decimals(18, 18), False))
		self.assertNotIn("cgst_amount", row)

	def test_invoices_and_parties_are_read_in_batches(self):
		gst_18 = _tax(("CGST", 9), ("SGST", 9))
		first = self._invoice((gst_18, 100, 1))
		self.party = make_party(self.receivable.name)
		second = self._invoice((gst_18, 200, 1))

		with patch.object(gst, "IN_LIST_BATCH_SIZE", 1):
			rows = [*self._rows(first), *self._rows(second)]

		self.assertEqual(
			[(row["invoice_no"], row["party"], row["taxable_value"]) for row in rows],
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
		rows = _run("Books GSTR-1", from_date=today, to_date=today)
		return [row for row in rows if row["invoice_no"] == invoice.name]


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
