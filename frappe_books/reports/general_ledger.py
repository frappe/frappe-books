from itertools import count

import frappe
from frappe import _

from frappe_books.accounting.money import as_decimal, sum_decimal

DOCTYPE = "Books Ledger Entry"
BALANCE = {"SUB": [{"SUM": "debit"}, {"SUM": "credit"}], "as": "balance"}
GROUP_FIELDS = {"party": "party", "account": "account", "reference_name": "voucher_no"}
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


def get_columns(filters) -> list[dict]:
	columns = [
		{"fieldname": "index", "label": "#", "fieldtype": "Int", "width": 60},
		{
			"fieldname": "account",
			"label": _("Account"),
			"fieldtype": "Link",
			"options": "Books Account",
			"width": 180,
		},
		{"fieldname": "date", "label": _("Date"), "fieldtype": "Date"},
		{"fieldname": "debit", "label": _("Debit"), "fieldtype": "Currency", "width": 150},
		{"fieldname": "credit", "label": _("Credit"), "fieldtype": "Currency", "width": 150},
		{"fieldname": "balance", "label": _("Balance"), "fieldtype": "Currency", "width": 150},
		{"fieldname": "party", "label": _("Party"), "fieldtype": "Link", "options": "Books Party"},
		{"fieldname": "reference_name", "label": _("Ref Name"), "fieldtype": "Data"},
		{"fieldname": "reference_type", "label": _("Ref Type"), "fieldtype": "Data"},
	]
	if filters.get("reverted"):
		columns.append({"fieldname": "reverted", "label": _("Reverted"), "fieldtype": "Check"})
	return columns


def get_data(filters) -> list[dict]:
	"""Return a period's ledger rows with opening, running, group and closing balances."""
	conditions = _conditions(filters)
	group_field = GROUP_FIELDS.get(filters.get("group_by") or "none")
	openings = _opening_balances(conditions, filters.get("from_date"), group_field)
	groups = _grouped_entries(_period_entries(conditions, filters), openings, group_field)
	index = count(1)
	rows = []
	for key, entries in groups.items():
		rows += _group_rows(key, entries, openings.get(key, as_decimal(0)), filters, index)
	if not rows or rows[-1]:
		rows.append({})
	rows.append(_closing_row(groups, openings))
	return rows


def _conditions(filters):
	conditions = [
		[fieldname, "=", filters[source]]
		for source, fieldname in (
			("party", "party"),
			("reference_name", "voucher_no"),
		)
		if filters.get(source)
	]
	if filters.get("account"):
		# A group account shows the entries of the accounts under it.
		conditions.append(["account", "descendants of (inclusive)", filters["account"]])
	if filters.get("reference_type") and filters["reference_type"] != "All":
		conditions.append(["voucher_type", "=", filters["reference_type"]])
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
	dates = [["posting_date", ">=", filters.get("from_date")], ["posting_date", "<=", filters.get("to_date")]]
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


def _group_rows(key, entries, opening, filters, index):
	rows = [_entry_row(entry, next(index)) for entry in entries]
	# Balances run in posting order even when the newest entries show first.
	balance = opening
	for row in rows if filters.get("ascending") else reversed(rows):
		balance += row["debit"] - row["credit"]
		row["balance"] = balance
	if filters.get("from_date"):
		rows.insert(0, _opening_row(key, opening, filters.get("group_by")))
	if filters.get("group_by") in GROUP_FIELDS:
		rows += [_total_row(rows, balance), {}]
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
		"reference_type": entry.voucher_type,
		"reference_name": entry.voucher_no,
		"reverted": bool(entry.reverted),
	}


def _opening_row(key, opening, group_by):
	row = {"type": "opening", "debit": as_decimal(0), "credit": as_decimal(0), "balance": opening}
	if group_by in GROUP_FIELDS:
		row[group_by] = key
	row["account"] = _("Opening: {0}").format(_(key)) if group_by == "account" else _("Opening")
	return row


def _total_row(rows, balance):
	entries = [row for row in rows if row["type"] == "entry"]
	return {
		"type": "total",
		"account": _("Total"),
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
		"account": _("Closing"),
		"debit": debit,
		"credit": credit,
		"balance": sum_decimal(openings.values()) + debit - credit,
	}
