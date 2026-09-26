from itertools import count
from typing import Literal, TypedDict

import frappe

from frappe_books.accounting.money import as_decimal, sum_decimal
from frappe_books.ui_bridge.mapping import source_reference, target_reference

DOCTYPE = "Books Ledger Entry"
BALANCE = {"SUB": [{"SUM": "debit"}, {"SUM": "credit"}], "as": "balance"}
GROUP_FIELDS = {"party": "party", "account": "account", "referenceName": "voucher_no"}
ENTRY_FIELDS = [
	"account",
	"posting_date",
	"debit",
	"credit",
	"voucher_type",
	"voucher_no",
	"party",
	"reverted",
]


class LedgerFilters(TypedDict, total=False):
	account: str | None
	party: str | None
	referenceType: str | None
	referenceName: str | None
	fromDate: str | None
	toDate: str | None
	groupBy: Literal["none", "party", "account", "referenceName"] | None
	reverted: bool | None
	ascending: bool | None


def general_ledger(filters: LedgerFilters) -> list[dict]:
	"""Return a period's ledger rows with opening, running, group and closing balances."""
	conditions = _conditions(filters)
	group_field = GROUP_FIELDS.get(filters.get("groupBy") or "none")
	openings = _opening_balances(conditions, filters.get("fromDate"), group_field)
	groups = _grouped_entries(_period_entries(conditions, filters), openings, group_field)
	index = count(1)
	rows = []
	for key, entries in groups.items():
		rows += _group_rows(key, entries, openings.get(key, as_decimal(0)), group_field, filters, index)
	if not rows or rows[-1]["type"] != "blank":
		rows.append({"type": "blank"})
	rows.append(_closing_row(groups, openings))
	return rows


def _conditions(filters):
	conditions = [
		[fieldname, "=", filters[source]]
		for source, fieldname in (("account", "account"), ("party", "party"), ("referenceName", "voucher_no"))
		if filters.get(source)
	]
	if filters.get("referenceType") and filters["referenceType"] != "All":
		conditions.append(["voucher_type", "=", target_reference(filters["referenceType"])])
	if not filters.get("reverted"):
		conditions.append(["reverted", "=", 0])
	return conditions


def _opening_balances(conditions, from_date, group_field):
	if not from_date:
		return {}
	rows = frappe.get_list(
		DOCTYPE,
		filters=[*conditions, ["posting_date", "<", from_date]],
		fields=[group_field, BALANCE] if group_field else [BALANCE],
		group_by=group_field,
		order_by=group_field,
	)
	return {(row.get(group_field) if group_field else "") or "": as_decimal(row.balance) for row in rows}


def _period_entries(conditions, filters):
	dates = [["posting_date", ">=", filters.get("fromDate")], ["posting_date", "<=", filters.get("toDate")]]
	direction = "asc" if filters.get("ascending") else "desc"
	return frappe.get_list(
		DOCTYPE,
		filters=[*conditions, *(date for date in dates if date[2])],
		fields=ENTRY_FIELDS,
		order_by=f"posting_date {direction}, creation {direction}",
	)


def _grouped_entries(entries, openings, group_field):
	if not group_field:
		return {"": entries}
	groups = {}
	for entry in entries:
		groups.setdefault(entry.get(group_field) or "", []).append(entry)
	for key in openings:
		groups.setdefault(key, [])
	return groups


def _group_rows(key, entries, opening, group_field, filters, index):
	rows = [_entry_row(entry, next(index)) for entry in entries]
	# Balances run in posting order even when the newest entries show first.
	balance = opening
	for row in rows if filters.get("ascending") else reversed(rows):
		balance += row["debit"] - row["credit"]
		row["balance"] = balance
	if filters.get("fromDate"):
		rows.insert(0, _opening_row(key, opening, group_field))
	if group_field:
		rows += [_total_row(rows, balance), {"type": "blank"}]
	return rows


def _entry_row(entry, index):
	return {
		"type": "entry",
		"index": index,
		"account": entry.account,
		"date": entry.posting_date,
		"debit": as_decimal(entry.debit),
		"credit": as_decimal(entry.credit),
		"party": entry.party,
		"referenceType": source_reference(entry.voucher_type),
		"referenceName": entry.voucher_no,
		"reverted": bool(entry.reverted),
	}


def _opening_row(key, opening, group_field):
	row = {"type": "opening", "debit": as_decimal(0), "credit": as_decimal(0), "balance": opening}
	source = next((source for source, field in GROUP_FIELDS.items() if field == group_field), None)
	if source:
		row[source] = key
	return row


def _total_row(rows, balance):
	entries = [row for row in rows if row["type"] == "entry"]
	return {
		"type": "total",
		"debit": sum_decimal(row["debit"] for row in entries),
		"credit": sum_decimal(row["credit"] for row in entries),
		"balance": balance,
	}


def _closing_row(groups, openings):
	entries = [entry for group in groups.values() for entry in group]
	debit = sum_decimal(entry.debit for entry in entries)
	credit = sum_decimal(entry.credit for entry in entries)
	return {
		"type": "closing",
		"debit": debit,
		"credit": credit,
		"balance": sum_decimal(openings.values()) + debit - credit,
	}
