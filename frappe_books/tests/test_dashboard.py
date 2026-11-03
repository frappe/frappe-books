from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import getdate

from frappe_books.reports.dashboard import (
	get_best_sellers,
	get_cash_balances,
	get_cashflow,
	get_invoice_summary,
	get_period_dates,
	get_profit_and_loss,
	get_top_expenses,
)
from frappe_books.reports.financial_statements import get_account_balances
from frappe_books.tests.accounting import ensure_user, make_account, root_group, unique_name

TODAY = "2031-12-15"
PERIODS = ("This Year", "This Quarter", "This Month", "YTD")


class IntegrationTestDashboard(IntegrationTestCase):
	def test_ledger_totals_are_grouped_by_account_and_month(self):
		cash = make_account("Dashboard Cash", account_type="Cash")
		rent = make_account("Dashboard Rent", root_type="Expense")
		sales = make_account("Dashboard Sales", root_type="Income")
		for date, account, debit, credit in (
			("2031-01-10", rent, 30, 0),
			("2031-01-20", rent, 20, 0),
			("2031-01-20", cash, 0, 50),
			("2031-02-05", cash, 80, 0),
			("2031-02-05", sales, 0, 80),
		):
			_post(account, debit, credit, date)

		with self.freeze_time(TODAY):
			expenses = get_top_expenses("This Year")
			cashflow = get_cashflow("This Year")
			profit = get_profit_and_loss("This Year")

		self.assertIn({"account": rent.name, "total": Decimal("50.00")}, expenses)
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

	def test_returns_reduce_the_paid_and_unpaid_totals(self):
		for total, outstanding, return_against in ((100, 40, None), (-30, -30, "Dashboard Original")):
			_invoice("2031-03-01", total, outstanding, return_against=return_against)

		with self.freeze_time(TODAY):
			summary = get_invoice_summary("Books Sales Invoice", "This Year")

		self.assertEqual(
			(summary["total"], summary["paid"], summary["unpaid"]),
			(Decimal("70.00"), Decimal("60.00"), Decimal("10.00")),
		)
		self.assertEqual((summary["paid_count"], summary["unpaid_count"]), (0, 2))


class IntegrationTestCashflow(IntegrationTestCase):
	def test_cashflow_has_data_only_with_cash_entries_in_the_period(self):
		_post(make_account("Period Cash", account_type="Cash"), 80, 0, "2031-01-10")

		with self.freeze_time(TODAY):
			self.assertTrue(get_cashflow("This Year")["has_data"])
			self.assertFalse(get_cashflow("This Month")["has_data"])


class IntegrationTestTopExpenses(IntegrationTestCase):
	def test_expenses_past_the_top_five_are_summed_as_others(self):
		for amount in (60, 50, 40, 30, 20, 10, 5):
			_post(make_account("Top Expense", root_type="Expense"), amount, 0, "2031-12-01")

		with self.freeze_time(TODAY):
			expenses = get_top_expenses("This Month")

		self.assertEqual([row["total"] for row in expenses], [60, 50, 40, 30, 20, 15])
		self.assertEqual(expenses[-1]["account"], "Others")


class IntegrationTestDashboardPeriods(IntegrationTestCase):
	def setUp(self):
		frappe.db.set_single_value(
			"Books Accounting Settings", {"year_start_date": "2026-04-01", "year_end_date": "2027-03-31"}
		)

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
				"YTD": _dates("2031-04-01", "2031-09-30"),
			},
		)
		self.assertEqual([month["yearmonth"] for month in months], ["2031-09"])

	def test_year_to_date_starts_on_the_fiscal_year_holding_today(self):
		with self.freeze_time("2032-02-15"):
			self.assertEqual(get_period_dates("YTD"), _dates("2031-04-01", "2032-02-15"))

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
		for operator, count in (("=", summary["paid_count"]), ("!=", summary["unpaid_count"])):
			# The filters the Paid and Unpaid buttons open the invoice list with.
			filters = [
				["docstatus", "in", [1, 2]],
				["docstatus", "not in", [2]],
				["outstanding_amount", operator, 0],
				["posting_date", ">=", summary["from_date"]],
				["posting_date", "<", summary["before_date"]],
			]
			self.assertEqual(len(frappe.get_list("Books Sales Invoice", filters=filters)), count)


class IntegrationTestCashBalances(IntegrationTestCase):
	def test_cash_and_bank_leaves_are_listed_in_chart_order_with_their_total(self):
		cash = make_account("Drawer Cash", account_type="Cash")
		bank = make_account("Drawer Bank", account_type="Bank")
		group = make_account(
			"Drawer Banks", account_type="Bank", is_group=1, parent_account=root_group("Asset")
		)
		rent = make_account("Drawer Rent", root_type="Expense")
		for account, debit, credit in ((cash, 80, 0), (cash, 0, 30), (bank, 200, 0), (rent, 15, 0)):
			_post(account, debit, credit, "2031-12-01")

		with self.freeze_time(TODAY):
			result = get_cash_balances()

		balances = {row["account"]: row["balance"] for row in result["accounts"]}
		names = list(balances)
		self.assertEqual((balances[cash.name], balances[bank.name]), (Decimal("50.00"), Decimal("200.00")))
		self.assertLess(names.index(cash.name), names.index(bank.name))
		self.assertNotIn(group.name, balances)
		self.assertNotIn(rent.name, balances)
		self.assertEqual(result["accounts"][names.index(cash.name)]["account_name"], cash.account_name)
		self.assertEqual(result["total"], sum(balances.values()))
		self.assertEqual(result["as_of"], getdate(TODAY))

	def test_entries_after_today_and_cancelled_entries_are_left_out(self):
		cash = make_account("Cut Off Cash", account_type="Cash")
		_post(cash, 100, 0, TODAY)
		_post(cash, 40, 0, "2031-12-16")
		_post(cash, 25, 0, "2031-12-01", is_cancelled=1)

		with self.freeze_time(TODAY):
			balances = {row["account"]: row["balance"] for row in get_cash_balances()["accounts"]}

		self.assertEqual(balances[cash.name], Decimal("100.00"))

	def test_unused_accounts_show_zero_and_an_overdraft_lowers_the_total(self):
		unused = make_account("Unused Bank", account_type="Bank")
		overdrawn = make_account("Overdrawn Bank", account_type="Bank")
		_post(overdrawn, 0, 40, "2031-12-01")

		with self.freeze_time(TODAY):
			result = get_cash_balances()

		balances = {row["account"]: row["balance"] for row in result["accounts"]}
		self.assertEqual(
			(balances[unused.name], balances[overdrawn.name]), (Decimal("0.00"), Decimal("-40.00"))
		)
		self.assertEqual(result["total"], sum(balances.values()))

	def test_the_total_adds_the_rounded_rows_and_dust_rounds_to_zero(self):
		# Three rows of 10.004 add to 30.01 raw but 30.00 rounded, so a raw sum would be off by a cent.
		rows = [make_account(f"Rounding Cash {index}", account_type="Cash") for index in range(3)]
		dust = make_account("Dust Bank", account_type="Bank")
		for account in rows:
			_post(account, 10.004, 0, "2031-12-01")
		_post(dust, 0, 0.004, "2031-12-01")

		with self.freeze_time(TODAY):
			result = get_cash_balances()

		balances = {row["account"]: row["balance"] for row in result["accounts"]}
		self.assertEqual([balances[account.name] for account in rows], [Decimal("10.00")] * 3)
		self.assertEqual(balances[dust.name], 0)
		self.assertEqual(result["total"], sum(balances.values()))


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


class IntegrationTestBestSellers(IntegrationTestCase):
	def tearDown(self):
		# Every invoice in the period counts, so one test's rows must not reach the next.
		frappe.db.rollback()

	def _best_sellers(self):
		with self.freeze_time(TODAY):
			return get_best_sellers("This Month")

	def test_only_the_five_best_sellers_come_back_and_the_total_counts_every_item(self):
		codes = [_item(f"Seller {index}") for index in range(7)]
		_invoice("2031-12-01", 0, 0, items=list(zip(codes, (60, 50, 40, 30, 20, 10, 5), strict=True)))
		_invoice("2031-12-02", 0, 0, items=[(codes[4], 45)])

		result = self._best_sellers()

		self.assertEqual(
			[(row["item"], row["amount"]) for row in result["items"]],
			[(codes[4], 65), (codes[0], 60), (codes[1], 50), (codes[2], 40), (codes[3], 30)],
		)
		self.assertEqual(result["items"][0]["item_name"], "Seller 4")
		self.assertNotIn(None, [row["item"] for row in result["items"]])
		self.assertEqual(result["total"], Decimal("260.00"))
		self.assertGreater(result["total"], sum(row["amount"] for row in result["items"]))

	def test_a_tie_at_fifth_place_keeps_the_first_item_code(self):
		codes = sorted(_item(f"Tied {index}") for index in range(6))
		amounts = (90, 80, 70, 60, 50, 50)
		_invoice("2031-12-01", 0, 0, items=list(zip(reversed(codes), amounts, strict=True)))

		result = self._best_sellers()

		fifth, sixth = codes[:2]
		self.assertEqual(result["items"][-1]["item"], fifth)
		self.assertNotIn(sixth, _amounts(result))
		self.assertEqual(result["total"], Decimal("400.00"))

	def test_amounts_are_converted_to_the_base_currency(self):
		doubled, plain = _item("Imported Book"), _item("Local Book")
		_invoice("2031-12-01", 0, 0, conversion_rate=2, items=[(doubled, 30)])
		_invoice("2031-12-01", 0, 0, conversion_rate=None, items=[(plain, 50)])

		amounts = _amounts(self._best_sellers())

		self.assertEqual((amounts[doubled], amounts[plain]), (Decimal("60.00"), Decimal("50.00")))

	def test_shared_names_show_their_code_and_unknown_items_show_the_code(self):
		first, second = _item("Atlas"), _item("Atlas")
		missing = unique_name("No Such Item")
		_invoice("2031-12-01", 0, 0, items=[(first, 30), (second, 20), (missing, 10)])

		labels = {row["item"]: row["item_name"] for row in self._best_sellers()["items"]}

		self.assertEqual(labels, {first: f"Atlas ({first})", second: f"Atlas ({second})", missing: missing})

	def test_returns_lower_an_item_and_drafts_cancelled_and_other_periods_do_not_count(self):
		kept, returned, cleared = _item("Kept Book"), _item("Returned Book"), _item("Cleared Book")
		_invoice("2031-12-01", 0, 0, items=[(kept, 100), (returned, 80), (cleared, 40)])
		_invoice("2031-12-05", 0, 0, is_return=1, items=[(returned, -30), (cleared, -40)])
		_invoice("2031-12-06", 0, 0, docstatus=0, items=[(kept, 500)])
		_invoice("2031-12-07", 0, 0, docstatus=2, items=[(kept, 500)])
		_invoice("2031-11-30", 0, 0, items=[(kept, 500)])
		_invoice("2031-12-16", 0, 0, items=[(kept, 500)])

		result = self._best_sellers()

		self.assertEqual(
			[(row["item"], row["amount"]) for row in result["items"]], [(kept, 100), (returned, 50)]
		)
		self.assertEqual(result["total"], Decimal("150.00"))

	def test_few_items_all_come_back_and_no_sales_is_empty(self):
		self.assertEqual(self._best_sellers(), {"items": [], "total": 0})

		codes = [_item(f"Few {index}") for index in range(3)]
		_invoice("2031-12-01", 0, 0, items=list(zip(codes, (30, 20, 10), strict=True)))

		result = self._best_sellers()
		self.assertEqual([row["item"] for row in result["items"]], codes)
		self.assertEqual(result["total"], Decimal("60.00"))

	def test_users_who_cannot_read_sales_invoices_are_refused(self):
		with self.set_user(ensure_user("books-dashboard-outsider@example.com", "Translator")):
			self.assertRaises(frappe.PermissionError, get_best_sellers, "This Month")


def _post(account, debit, credit, date="2031-01-10", **values):
	frappe.get_doc(
		{
			"doctype": "Books GL Entry",
			"posting_date": date,
			"account": account.name,
			"debit": debit,
			"credit": credit,
			**values,
		}
	).insert()


def _invoice(date, total, outstanding, items=(), **values):
	"""Insert a submitted invoice dated `date`, a date with an optional time.

	`items` is a list of `(item_code, amount)` rows; `db_insert()` writes no child rows, so they are inserted here.
	"""
	posting_date, _, posting_time = date.partition(" ")
	invoice = frappe.get_doc(
		{
			"doctype": "Books Sales Invoice",
			"name": frappe.generate_hash(),
			"posting_date": posting_date,
			"posting_time": posting_time or None,
			"docstatus": 1,
			"conversion_rate": 1,
			"base_grand_total": total,
			"outstanding_amount": outstanding,
			**values,
		}
	)
	invoice.db_insert()
	for idx, (item_code, amount) in enumerate(items, start=1):
		frappe.get_doc(
			{
				"doctype": "Books Sales Invoice Item",
				"name": frappe.generate_hash(),
				"parent": invoice.name,
				"parenttype": invoice.doctype,
				"parentfield": "items",
				"idx": idx,
				"docstatus": invoice.docstatus,
				"item_code": item_code,
				"amount": amount,
			}
		).db_insert()


def _item(item_name):
	"""Insert an item named `item_name` with a unique code, and return the code."""
	code = unique_name("Dashboard Item")
	frappe.get_doc(
		{
			"doctype": "Books Item",
			"name": code,
			"item_code": code,
			"item_name": item_name,
			"stock_uom": "Unit",
		}
	).db_insert()
	return code


def _amounts(result):
	return {row["item"]: row["amount"] for row in result["items"]}


def _dates(*dates):
	return tuple(getdate(date) for date in dates)
