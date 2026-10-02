from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import add_days, getdate

from frappe_books.accounting.money import as_decimal, sum_decimal
from frappe_books.reports.periods import get_fiscal_year

LEDGER = "Books Ledger Entry"
CREDIT_ROOT_TYPES = {"Liability", "Equity", "Income"}
BALANCE_SHEET = ("Asset", "Liability", "Equity")
TRIAL_BALANCE = ("Asset", "Liability", "Income", "Expense", "Equity")
TRIAL_BALANCE_KEYS = ("opening_debit", "opening_credit", "debit", "credit", "closing_debit", "closing_credit")


def get_statement_default_filters() -> dict:
	start, end = get_fiscal_year()
	return {
		"based_on": "Until Date",
		"periodicity": "Monthly",
		"count": 3,
		"to_date": getdate(),
		"from_year": start.year,
		"to_year": end.year,
	}


def get_trial_balance_default_filters() -> dict:
	start, end = get_fiscal_year()
	return {"from_date": start, "to_date": end}


def get_statement_columns(periods) -> list[dict]:
	return [
		_account_column(),
		*(_amount_column(period.key, period.label) for period in periods),
	]


def get_profit_and_loss_columns(periods) -> list[dict]:
	"""Return the statement columns, then a Total column when there is more than one period."""
	columns = get_statement_columns(periods)
	if len(periods) > 1:
		columns.append(_amount_column("total", _("Total")))
	return columns


def get_trial_balance_columns() -> list[dict]:
	labels = (
		_("Opening (Dr)"),
		_("Opening (Cr)"),
		_("Debit"),
		_("Credit"),
		_("Closing (Dr)"),
		_("Closing (Cr)"),
	)
	return [
		_account_column(),
		*(_amount_column(key, label) for key, label in zip(TRIAL_BALANCE_KEYS, labels, strict=True)),
	]


def get_profit_and_loss(filters, periods) -> list[dict]:
	"""Return income and expense accounts with the net movement of each period and in total, and the profit."""
	sections = _with_totals(
		_statement(("Income", "Expense"), [(period.from_date, period.to_date) for period in periods])
	)
	keys = [*(period.key for period in periods), "total"]
	totals = {"Income": _("Total Income (Credit)"), "Expense": _("Total Expense (Debit)")}
	rows = _rows(sections, keys, filters.hide_group_amounts, totals)
	if not sections:
		return rows
	profit = _profit(sections, len(keys))
	return [
		*rows,
		{},
		{"account": _("Total Profit"), "indent": 0, "bold": 1, **dict(zip(keys, profit, strict=True))},
	]


def get_balance_sheet(filters, periods) -> list[dict]:
	"""Return asset, liability and equity balances at the end of each period, and the profit not closed into equity."""
	keys = [period.key for period in periods]
	sections = _statement(
		(*BALANCE_SHEET, "Income", "Expense"), [(None, period.to_date) for period in periods]
	)
	balances = [section for section in sections if section["root_type"] in BALANCE_SHEET]
	totals = {
		"Asset": _("Total Asset (Debit)"),
		"Liability": _("Total Liability (Credit)"),
		"Equity": _("Total Equity (Credit)"),
	}
	rows = _rows(balances, keys, filters.hide_group_amounts, totals)
	profit = _profit(sections, len(keys))
	if not any(profit):
		return rows
	credits = [section["total"] for section in balances if section["root_type"] != "Asset"]
	credit_total = [sum_decimal(values) for values in zip(profit, *credits, strict=True)]
	return [
		*rows,
		{},
		{
			"account": _("Provisional Profit / Loss (Credit)"),
			"indent": 0,
			**dict(zip(keys, profit, strict=True)),
		},
		{"account": _("Total (Credit)"), "indent": 0, **dict(zip(keys, credit_total, strict=True))},
	]


def get_trial_balance(filters) -> list[dict]:
	"""Return each account's opening, period and closing debit and credit."""
	from_date = getdate(filters.from_date)
	opening = _ledger_sums(None, add_days(from_date, -1))
	period = _ledger_sums(from_date, filters.to_date)
	values = {}
	for account in opening.keys() | period.keys():
		before = opening.get(account, (as_decimal(0), as_decimal(0)))
		during = period.get(account, (as_decimal(0), as_decimal(0)))
		closing = (before[0] + during[0], before[1] + during[1])
		values[account] = [*_split(before), *during, *_split(closing)]
	sections = _sections(TRIAL_BALANCE, values, len(TRIAL_BALANCE_KEYS))
	rows = _rows(sections, TRIAL_BALANCE_KEYS, filters.hide_group_amounts)
	if not sections:
		return rows
	total = [sum_decimal(values) for values in zip(*(section["total"] for section in sections), strict=True)]
	return [
		*rows,
		{},
		{"account": _("Total"), "indent": 0, **dict(zip(TRIAL_BALANCE_KEYS, total, strict=True))},
	]


@frappe.whitelist()
def get_account_balances() -> dict:
	"""Return each account's balance on the side its root type keeps it, and the root types kept on credit."""
	accounts = _accounts()
	balances = {
		account: _balance(accounts[account].root_type, debit, credit)
		for account, (debit, credit) in _ledger_sums(None, None).items()
	}
	return {"balances": balances, "credit_root_types": sorted(CREDIT_ROOT_TYPES)}


def _account_column():
	return {
		"fieldname": "account",
		"label": _("Account"),
		"fieldtype": "Link",
		"options": "Books Account",
		"width": 240,
	}


def _amount_column(fieldname, label):
	return {"fieldname": fieldname, "label": label, "fieldtype": "Currency", "width": 150}


def _statement(root_types, date_ranges):
	values = defaultdict(lambda: [as_decimal(0)] * len(date_ranges))
	accounts = _accounts()
	for index, (from_date, to_date) in enumerate(date_ranges):
		for account, (debit, credit) in _ledger_sums(from_date, to_date).items():
			values[account][index] = _balance(accounts[account].root_type, debit, credit)
	return _sections(root_types, values, len(date_ranges), accounts)


def _balance(root_type, debit, credit):
	return credit - debit if root_type in CREDIT_ROOT_TYPES else debit - credit


def _ledger_sums(from_date, to_date):
	"""Return the debit and credit totals of each account, both dates included."""
	filters = [["reverted", "=", 0]]
	if from_date:
		filters.append(["posting_date", ">=", from_date])
	if to_date:
		filters.append(["posting_date", "<=", to_date])
	rows = frappe.get_list(
		LEDGER,
		filters=filters,
		fields=["account", {"SUM": "debit", "as": "debit"}, {"SUM": "credit", "as": "credit"}],
		group_by="account",
		order_by="account",
	)
	return {row.account: (as_decimal(row.debit), as_decimal(row.credit)) for row in rows}


def _split(totals):
	balance = totals[0] - totals[1]
	return (max(balance, as_decimal(0)), max(-balance, as_decimal(0)))


def _sections(root_types, values, width, accounts=None):
	accounts = accounts or _accounts()
	rows_by_root_type = defaultdict(list)
	for row in _account_rows(accounts, _rolled_up(accounts, values, width)):
		rows_by_root_type[row.pop("root_type")].append(row)
	sections = []
	for root_type in root_types:
		rows = rows_by_root_type[root_type]
		if rows:
			sections.append({"root_type": root_type, "accounts": rows, "total": _total(rows, width)})
	return sections


def _accounts():
	accounts = frappe.get_list(
		"Books Account",
		fields=["name", "root_type", "is_group", "parent_books_account"],
		order_by="lft asc",
	)
	return {account.name: account for account in accounts}


def _rolled_up(accounts, values, width):
	"""Add each account's values to its own row and to every ancestor's row."""
	rolled_up = {}
	for name, account_values in values.items():
		while name:
			row = rolled_up.setdefault(name, [as_decimal(0)] * width)
			rolled_up[name] = [total + value for total, value in zip(row, account_values, strict=True)]
			name = accounts[name].parent_books_account
	return rolled_up


def _account_rows(accounts, values):
	levels = {}
	rows = []
	for account in accounts.values():
		levels[account.name] = levels.get(account.parent_books_account, -1) + 1
		if account.name in values:
			rows.append(
				{
					"account": account.name,
					"root_type": account.root_type,
					"indent": levels[account.name],
					"is_group": bool(account.is_group),
					"values": values[account.name],
				}
			)
	return rows


def _profit(sections, width):
	"""Return income less expense in each value column."""
	totals = {section["root_type"]: section["total"] for section in sections}
	zero = [as_decimal(0)] * width
	income, expense = totals.get("Income", zero), totals.get("Expense", zero)
	return [income_value - expense_value for income_value, expense_value in zip(income, expense, strict=True)]


def _total(rows, width):
	total = [as_decimal(0)] * width
	for row in rows:
		if row["indent"] == 0:
			total = [amount + value for amount, value in zip(total, row["values"], strict=True)]
	return total


def _with_totals(sections):
	"""Add the sum of the periods after the values of each account and section."""
	for section in sections:
		for account in section["accounts"]:
			account["values"] = [*account["values"], sum_decimal(account["values"])]
		section["total"] = [*section["total"], sum_decimal(section["total"])]
	return sections


def _rows(sections, keys, hide_group_amounts, total_labels=None):
	"""Flatten the sections into report rows, with a total row per section and a blank row between."""
	rows = []
	for section in sections:
		rows += [_account_row(account, keys, hide_group_amounts) for account in section["accounts"]]
		if label := (total_labels or {}).get(section["root_type"]):
			rows.append({"account": label, "indent": 0, **dict(zip(keys, section["total"], strict=True))})
		rows.append({})
	return rows[:-1]


def _account_row(account, keys, hide_group_amounts):
	values = account["values"]
	if hide_group_amounts and account["is_group"]:
		values = [None] * len(keys)
	return {
		"account": account["account"],
		"indent": account["indent"],
		"is_group": account["is_group"],
		**dict(zip(keys, values, strict=True)),
	}
