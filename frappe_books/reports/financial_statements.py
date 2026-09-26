from collections import defaultdict
from typing import TypedDict

import frappe

from frappe_books.accounting.money import as_decimal

LEDGER = "Books Ledger Entry"
CREDIT_ROOT_TYPES = {"Liability", "Equity", "Income"}
PROFIT_AND_LOSS = ("Income", "Expense")
BALANCE_SHEET = ("Asset", "Liability", "Equity")
TRIAL_BALANCE = ("Asset", "Liability", "Income", "Expense", "Equity")


class Period(TypedDict):
	fromDate: str | None
	toDate: str


def profit_and_loss(periods: list[Period]) -> dict:
	"""Return income and expense accounts with the net movement of each period, and the profit."""
	sections = _statement(PROFIT_AND_LOSS, [(period["fromDate"], period["toDate"]) for period in periods])
	totals = {section["rootType"]: section["total"] for section in sections}
	zero = [as_decimal(0)] * len(periods)
	profit = [
		income - expense
		for income, expense in zip(totals.get("Income", zero), totals.get("Expense", zero), strict=True)
	]
	return {"sections": sections, "profit": profit}


def balance_sheet(periods: list[Period]) -> dict:
	"""Return asset, liability and equity accounts with their balance at the end of each period."""
	return {"sections": _statement(BALANCE_SHEET, [(None, period["toDate"]) for period in periods])}


def trial_balance(from_date: str, to_date: str) -> dict:
	"""Return each account's opening, period and closing debit and credit; `to_date` is exclusive."""
	opening = _ledger_sums(None, from_date)
	period = _ledger_sums(from_date, to_date)
	values = {}
	for account in opening.keys() | period.keys():
		before = opening.get(account, (as_decimal(0), as_decimal(0)))
		during = period.get(account, (as_decimal(0), as_decimal(0)))
		closing = (before[0] + during[0], before[1] + during[1])
		values[account] = [*_split(before), *during, *_split(closing)]
	return {"sections": _sections(TRIAL_BALANCE, values, 6)}


def _statement(root_types, date_ranges):
	values = defaultdict(lambda: [as_decimal(0)] * len(date_ranges))
	accounts = _accounts()
	for index, (from_date, to_date) in enumerate(date_ranges):
		for account, (debit, credit) in _ledger_sums(from_date, to_date).items():
			is_credit = accounts[account].root_type in CREDIT_ROOT_TYPES
			values[account][index] = credit - debit if is_credit else debit - credit
	return _sections(root_types, values, len(date_ranges), accounts)


def _ledger_sums(from_date, to_date):
	"""Return the debit and credit totals of each account; `to_date` is exclusive."""
	filters = [["reverted", "=", 0], ["posting_date", "<", to_date]]
	if from_date:
		filters.append(["posting_date", ">=", from_date])
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
		rows_by_root_type[row.pop("rootType")].append(row)
	sections = []
	for root_type in root_types:
		rows = rows_by_root_type[root_type]
		if rows:
			sections.append({"rootType": root_type, "accounts": rows, "total": _total(rows, width)})
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
					"name": account.name,
					"rootType": account.root_type,
					"level": levels[account.name],
					"isGroup": bool(account.is_group),
					"values": values[account.name],
				}
			)
	return rows


def _total(rows, width):
	total = [as_decimal(0)] * width
	for row in rows:
		if row["level"] == 0:
			total = [amount + value for amount, value in zip(total, row["values"], strict=True)]
	return total
