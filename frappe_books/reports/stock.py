from typing import Literal, TypedDict

import frappe

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.reports.filters import datetime_conditions
from frappe_books.ui_bridge.mapping import source_reference, target_reference

DOCTYPE = "Books Stock Ledger Entry"
LEDGER_FIELDS = [
	"date",
	"item",
	"location",
	"batch",
	"serial_number",
	"quantity",
	"rate",
	"value_change",
	"balance_quantity",
	"balance_value",
	"reference_type",
	"reference_name",
]
MOVEMENT = [{"SUM": "quantity", "as": "quantity"}, {"SUM": "value_change", "as": "value"}]


class StockFilters(TypedDict, total=False):
	item: str | None
	location: str | None
	batch: str | None
	fromDate: str | None
	toDate: str | None
	referenceType: str | None
	referenceName: str | None
	ascending: bool | None
	showSerialNumbers: bool | None
	serialNumberFilter: Literal["All", "In stock", "Out stock"] | None


def stock_ledger(filters: StockFilters) -> list[dict]:
	"""Return stock ledger entries with the FIFO balances stored on each entry."""
	conditions = [
		*_key_conditions(filters),
		*datetime_conditions("date", filters.get("fromDate"), filters.get("toDate")),
	]
	if filters.get("referenceType") and filters["referenceType"] != "All":
		conditions.append(["reference_type", "=", target_reference(filters["referenceType"])])
	if filters.get("referenceName"):
		conditions.append(["reference_name", "=", filters["referenceName"]])
	direction = "asc" if filters.get("ascending") else "desc"
	entries = frappe.get_list(
		DOCTYPE, filters=conditions, fields=LEDGER_FIELDS, order_by=f"date {direction}, name {direction}"
	)
	return [_ledger_row(entry) for entry in entries]


def stock_balance(filters: StockFilters) -> list[dict]:
	"""Return opening, incoming, outgoing and closing stock of each item, location and batch."""
	key_fields = ["item", "location", "batch"]
	conditions = _key_conditions(filters)
	if filters.get("showSerialNumbers"):
		key_fields.append("serial_number")
		conditions.append(["serial_number", "is", "set"])
	period = [*conditions, *datetime_conditions("date", filters.get("fromDate"), filters.get("toDate"))]
	balances = {}
	if filters.get("fromDate"):
		_add_movement(balances, key_fields, [*conditions, ["date", "<", filters["fromDate"]]], "opening")
	_add_movement(balances, key_fields, [*period, ["quantity", ">", 0]], "incoming")
	_add_movement(balances, key_fields, [*period, ["quantity", "<", 0]], "outgoing")
	rows = [_balance_row(key, key_fields, movement) for key, movement in sorted(balances.items())]
	return [row for row in rows if _matches_serial_filter(row, filters.get("serialNumberFilter"))]


def _key_conditions(filters):
	return [[field, "=", filters[field]] for field in ("item", "location", "batch") if filters.get(field)]


def _ledger_row(entry):
	quantity = as_decimal(entry.quantity)
	return {
		"date": entry.date,
		"item": entry.item,
		"location": entry.location,
		"batch": entry.batch or "",
		"serialNumber": entry.serial_number or "",
		"quantity": quantity,
		"balanceQuantity": as_decimal(entry.balance_quantity),
		"incomingRate": _incoming_rate(entry.rate, entry.value_change, quantity),
		"valuationRate": _valuation_rate(entry.balance_value, entry.balance_quantity),
		"balanceValue": as_decimal(entry.balance_value),
		"valueChange": as_decimal(entry.value_change),
		"referenceName": entry.reference_name,
		"referenceType": source_reference(entry.reference_type),
	}


def _incoming_rate(rate, value_change, quantity):
	"""Return the entry's own rate for stock in, and the FIFO rate it left at for stock out."""
	if quantity > 0:
		return as_decimal(rate)
	return rounded(as_decimal(value_change) / quantity) if quantity else as_decimal(0)


def _add_movement(balances, key_fields, conditions, column):
	group_by = ", ".join(key_fields)
	rows = frappe.get_list(
		DOCTYPE, filters=conditions, fields=[*key_fields, *MOVEMENT], group_by=group_by, order_by=group_by
	)
	for row in rows:
		key = tuple(row[field] or "" for field in key_fields)
		balances.setdefault(key, {})[column] = (as_decimal(row.quantity), as_decimal(row.value))


def _balance_row(key, key_fields, movement):
	zero = (as_decimal(0), as_decimal(0))
	opening, incoming, outgoing = (
		movement.get(column, zero) for column in ("opening", "incoming", "outgoing")
	)
	balance_quantity = opening[0] + incoming[0] + outgoing[0]
	balance_value = opening[1] + incoming[1] + outgoing[1]
	return {
		**dict(zip(("item", "location", "batch", "serialNumber"), key, strict=False)),
		"balanceQuantity": balance_quantity,
		"balanceValue": balance_value,
		"openingQuantity": opening[0],
		"openingValue": opening[1],
		"incomingQuantity": incoming[0],
		"incomingValue": incoming[1],
		"outgoingQuantity": -outgoing[0],
		"outgoingValue": -outgoing[1],
		"valuationRate": _valuation_rate(balance_value, balance_quantity),
	}


def _matches_serial_filter(row, serial_filter):
	if serial_filter == "In stock":
		return row["balanceQuantity"] > 0
	if serial_filter == "Out stock":
		return row["balanceQuantity"] <= 0
	return True


def _valuation_rate(value, quantity):
	quantity = as_decimal(quantity)
	return rounded(as_decimal(value) / quantity) if quantity else as_decimal(0)
