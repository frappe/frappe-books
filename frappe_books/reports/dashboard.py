from collections import Counter

import frappe
from frappe import _
from frappe.query_builder.functions import Coalesce, NullIf, Sum
from frappe.utils import add_days, add_months, get_first_day, getdate, month_diff

from frappe_books.accounting.accounts import DASHBOARD_ROOT_TYPES
from frappe_books.accounting.money import as_decimal, rounded, sum_decimal
from frappe_books.reports.filters import datetime_conditions
from frappe_books.reports.periods import get_fiscal_year

LEDGER = "Books GL Entry"
SALES_INVOICE = "Books Sales Invoice"
TOP_COUNT = 5
INVOICE_DOCTYPES = ("Books Sales Invoice", "Books Purchase Invoice")
PERIOD_MONTHS = {"This Year": 12, "This Quarter": 3, "This Month": 1}
MONTH_FIELDS = [{"YEAR": "posting_date", "as": "year"}, {"MONTH": "posting_date", "as": "month"}]
DEBIT_MINUS_CREDIT = {"SUB": [{"SUM": "debit"}, {"SUM": "credit"}], "as": "balance"}
CREDIT_MINUS_DEBIT = {"SUB": [{"SUM": "credit"}, {"SUM": "debit"}], "as": "balance"}
CASH_ACCOUNTS = {"account.account_type": ["in", ["Cash", "Bank"]]}


def get_period_dates(period: str) -> tuple:
	"""Return the first and last day of a dashboard period, which ends today."""
	today = getdate()
	if period == "YTD":
		return get_fiscal_year(today)[0], today
	if period not in PERIOD_MONTHS:
		frappe.throw(_("Unknown dashboard period: {0}").format(period))
	return get_first_day(add_months(today, 1 - PERIOD_MONTHS[period])), today


@frappe.whitelist()
def get_cashflow(period: str) -> dict:
	"""Return the cash and bank inflow and outflow of each month, and whether the period has any."""
	from_date, to_date = get_period_dates(period)
	fields = [*MONTH_FIELDS, {"SUM": "debit", "as": "inflow"}, {"SUM": "credit", "as": "outflow"}]
	totals = _monthly_totals(from_date, to_date, CASH_ACCOUNTS, fields)
	months = [
		{
			"yearmonth": month,
			"inflow": rounded(totals[month].inflow if month in totals else 0),
			"outflow": rounded(totals[month].outflow if month in totals else 0),
		}
		for month in _months(from_date, to_date)
	]
	return {"months": months, "has_data": bool(totals)}


@frappe.whitelist()
def get_profit_and_loss(period: str) -> dict:
	"""Return the profit of each month: its income less its expenses."""
	from_date, to_date = get_period_dates(period)
	income = _monthly_totals(
		from_date, to_date, {"account.root_type": "Income"}, [*MONTH_FIELDS, CREDIT_MINUS_DEBIT]
	)
	expense = _monthly_totals(
		from_date, to_date, {"account.root_type": "Expense"}, [*MONTH_FIELDS, DEBIT_MINUS_CREDIT]
	)
	months = [
		{"yearmonth": month, "balance": _balance(income, month) - _balance(expense, month)}
		for month in _months(from_date, to_date)
	]
	return {"months": months, "has_data": bool(income or expense)}


@frappe.whitelist()
def get_top_expenses(period: str) -> list[dict]:
	"""Return the five expense accounts with the most spent in the period, and the rest as Others."""
	from_date, to_date = get_period_dates(period)
	rows = frappe.get_list(
		LEDGER,
		filters=_ledger_filters(from_date, to_date, {"account.root_type": "Expense"}),
		fields=["account", DEBIT_MINUS_CREDIT],
		group_by="account",
		order_by="account",
	)
	# The query engine wraps an ORDER BY on this expression alias in MAX() on Postgres.
	spent = sorted((row for row in rows if row.balance > 0), key=lambda row: row.balance, reverse=True)
	expenses = [{"account": row.account, "total": rounded(row.balance)} for row in spent[:TOP_COUNT]]
	if others := spent[TOP_COUNT:]:
		expenses.append({"account": _("Others"), "total": rounded(sum(row.balance for row in others))})
	return expenses


@frappe.whitelist()
def get_best_sellers(period: str) -> dict:
	"""Return the five items with the most sales in the period, and the total sales of every item."""
	frappe.has_permission(SALES_INVOICE, "read", throw=True)
	from_date, to_date = get_period_dates(period)
	sales = [(row.item_code, rounded(row.amount)) for row in _item_sales(from_date, to_date)]
	# The raw sums are floats on SQLite and Decimals elsewhere, so rank the rounded amounts.
	sold = sorted(
		((code, amount) for code, amount in sales if amount > 0), key=lambda sale: (-sale[1], sale[0])
	)
	top = sold[:TOP_COUNT]
	labels = _item_labels([code for code, _amount in top])
	items = [{"item": code, "item_name": labels[code], "amount": amount} for code, amount in top]
	return {"items": items, "total": rounded(sum_decimal(amount for _code, amount in sold))}


@frappe.whitelist()
def get_cash_balances() -> dict:
	"""Return each cash and bank account's balance as of today, and their total."""
	frappe.has_permission(LEDGER, "read", throw=True)
	as_of = getdate()
	accounts = _dashboard_accounts()
	sums = {}
	if names := [account.name for account in accounts]:
		rows = frappe.get_list(
			LEDGER,
			filters={"is_cancelled": 0, "posting_date": ["<=", as_of], "account": ["in", names]},
			fields=["account", DEBIT_MINUS_CREDIT],
			group_by="account",
			order_by="account",
		)
		sums = {row.account: row.balance for row in rows}
	balances = [
		{
			"account": account.name,
			"account_name": account.account_name,
			"balance": rounded(sums.get(account.name, 0)),
		}
		for account in accounts
	]
	return {
		"accounts": balances,
		"total": rounded(sum_decimal(row["balance"] for row in balances)),
		"as_of": as_of,
	}


@frappe.whitelist()
def get_invoice_summary(doctype: str, period: str) -> dict:
	"""Return the paid and unpaid amounts and counts of the period's submitted invoices.

	Credit notes are negative, so they reduce the amounts. `from_date` and `before_date` bound the invoice dates.
	"""
	if doctype not in INVOICE_DOCTYPES:
		frappe.throw(_("{0} is not an invoice.").format(doctype))
	from_date, to_date = get_period_dates(period)
	conditions = [
		["docstatus", "=", 1],
		*datetime_conditions("posting_date", from_date, to_date),
	]
	totals = _invoice_totals(doctype, conditions)
	total, unpaid = as_decimal(totals.total), as_decimal(totals.outstanding)
	paid_count, unpaid_count = (
		_count(doctype, [*conditions, ["outstanding_amount", operator, 0]]) for operator in ("=", "!=")
	)
	return {
		"total": rounded(total),
		"paid": rounded(total - unpaid),
		"unpaid": rounded(unpaid),
		"paid_count": paid_count,
		"unpaid_count": unpaid_count,
		"from_date": from_date,
		"before_date": add_days(to_date, 1),
	}


def _monthly_totals(from_date, to_date, filters, fields) -> dict:
	rows = frappe.get_list(
		LEDGER,
		filters=_ledger_filters(from_date, to_date, filters),
		fields=fields,
		group_by="year, month",
		order_by="year, month",
	)
	return {f"{row.year:04d}-{row.month:02d}": row for row in rows}


def _item_sales(from_date, to_date) -> list:
	"""Each item's sold amount in base currency over the period's submitted invoices, returns included."""
	# get_list applies the reader's row level permissions, which the query below would bypass.
	# Unrun, it is a subquery, so no name list hits the database parameter limit.
	names = frappe.get_list(
		SALES_INVOICE,
		filters={"docstatus": 1, "posting_date": ["between", [from_date, to_date]]},
		pluck="name",
		limit_page_length=0,
		order_by=None,
		run=False,
	)
	invoice = frappe.qb.DocType(SALES_INVOICE)
	row = frappe.qb.DocType("Books Sales Invoice Item")
	# An empty rate is stored as 0; count it as 1, as the invoice code does with `conversion_rate or 1`.
	rate = Coalesce(NullIf(invoice.conversion_rate, 0), 1)
	# No ORDER BY: the query engine wraps an ORDER BY on an expression alias in MAX() on Postgres.
	return (
		frappe.qb.from_(row)
		.join(invoice)
		.on(row.parent == invoice.name)
		.select(row.item_code, Sum(row.amount * rate).as_("amount"))
		.where(row.parenttype == SALES_INVOICE)
		.where(row.parentfield == "items")
		.where(invoice.name.isin(names))
		.groupby(row.item_code)
		.run(as_dict=True)
	)


def _item_labels(codes) -> dict:
	"""Each item's name, or its code when it has none; a name shared with another slice gets its code."""
	# A sales reader already sees these names on the invoice rows, so Item read is not needed.
	if not codes:
		return {}
	items = frappe.get_all("Books Item", filters={"name": ["in", codes]}, fields=["name", "item_name"])
	names = {item.name: item.item_name for item in items}
	labels = {code: names.get(code) or code for code in codes}
	# Adding a code can produce another item's name ("Atlas (A)"), so repeat until every label is unique.
	with_code = set()
	while True:
		final = {code: f"{label} ({code})" if code in with_code else label for code, label in labels.items()}
		counts = Counter(final.values())
		clashing = {code for code, label in final.items() if counts[label] > 1} - with_code
		if not clashing:
			return final
		with_code |= clashing


def _dashboard_accounts():
	"""The accounts the dashboard lists: the picked ones, else the leaf cash and bank accounts, in chart order."""
	# A ledger reader already sees these names on its entries, so Account read is not needed.
	# get_list on the child rows would also need parent_doctype and Accounting Settings read.
	picked = frappe.get_all(
		"Books Dashboard Account",
		filters={"parenttype": "Books Accounting Settings", "parentfield": "dashboard_accounts"},
		pluck="account",
	)
	if picked:
		accounts = frappe.get_all(
			"Books Account",
			filters={"name": ["in", picked], "is_group": 0, "root_type": ["in", DASHBOARD_ROOT_TYPES]},
			fields=["name", "account_name"],
			order_by="lft",
		)
		if accounts:
			return accounts
	return frappe.get_all(
		"Books Account",
		filters={"account_type": ["in", ["Cash", "Bank"]], "is_group": 0},
		fields=["name", "account_name"],
		order_by="lft",
	)


def _months(from_date, to_date):
	return [add_months(from_date, index).strftime("%Y-%m") for index in range(month_diff(to_date, from_date))]


def _balance(totals, month):
	return rounded(totals[month].balance if month in totals else 0)


def _ledger_filters(from_date, to_date, filters):
	return {
		"is_cancelled": 0,
		"posting_date": ["between", [from_date, to_date]],
		**filters,
	}


def _invoice_totals(doctype, conditions):
	fields = [{"SUM": "base_grand_total", "as": "total"}, {"SUM": "outstanding_amount", "as": "outstanding"}]
	return frappe.get_list(doctype, filters=conditions, fields=fields)[0]


def _count(doctype, conditions):
	return frappe.get_list(doctype, filters=conditions, fields=[{"COUNT": "*", "as": "count"}])[0].count
