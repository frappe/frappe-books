import frappe
from frappe import _
from frappe.utils import add_days, add_months, get_first_day, getdate, month_diff

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.reports.filters import datetime_conditions
from frappe_books.reports.periods import get_fiscal_year

LEDGER = "Books Ledger Entry"
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
	expenses = [{"account": row.account, "total": rounded(row.balance)} for row in spent[:5]]
	if others := spent[5:]:
		expenses.append({"account": _("Others"), "total": rounded(sum(row.balance for row in others))})
	return expenses


@frappe.whitelist()
def get_invoice_summary(doctype: str, period: str) -> dict:
	"""Return the paid and unpaid amounts and counts of the period's submitted invoices.

	Credit notes are negative, so they reduce the amounts. `from_date` and `before_date` bound the invoice dates.
	"""
	if doctype not in INVOICE_DOCTYPES:
		frappe.throw(_("{0} is not an invoice.").format(doctype))
	from_date, to_date = get_period_dates(period)
	conditions = [["docstatus", "=", 1], *datetime_conditions("date", from_date, to_date)]
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


def _months(from_date, to_date):
	return [add_months(from_date, index).strftime("%Y-%m") for index in range(month_diff(to_date, from_date))]


def _balance(totals, month):
	return rounded(totals[month].balance if month in totals else 0)


def _ledger_filters(from_date, to_date, filters):
	return {"reverted": 0, "posting_date": ["between", [from_date, to_date]], **filters}


def _invoice_totals(doctype, conditions):
	fields = [{"SUM": "base_grand_total", "as": "total"}, {"SUM": "outstanding_amount", "as": "outstanding"}]
	return frappe.get_list(doctype, filters=conditions, fields=fields)[0]


def _count(doctype, conditions):
	return frappe.get_list(doctype, filters=conditions, fields=[{"COUNT": "*", "as": "count"}])[0].count
