from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.utils import get_datetime, get_system_timezone

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.reports.filters import datetime_conditions

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
GROUP_FIELDS = ("item", "location", "reference_name")
MOVEMENT = [{"SUM": "quantity", "as": "quantity"}, {"SUM": "value_change", "as": "value"}]


def get_ledger_columns() -> list[dict]:
	return [
		{"fieldname": "index", "label": "#", "fieldtype": "Int", "width": 60},
		{"fieldname": "date", "label": _("Date"), "fieldtype": "Datetime", "width": 150},
		{"fieldname": "item", "label": _("Item"), "fieldtype": "Link", "options": "Books Item"},
		{"fieldname": "location", "label": _("Location"), "fieldtype": "Link", "options": "Books Location"},
		*_tracking_columns(show_serial_numbers=True),
		{"fieldname": "quantity", "label": _("Quantity"), "fieldtype": "Float"},
		{"fieldname": "balance_quantity", "label": _("Balance Qty."), "fieldtype": "Float"},
		{"fieldname": "incoming_rate", "label": _("Incoming rate"), "fieldtype": "Currency"},
		{"fieldname": "valuation_rate", "label": _("Valuation Rate"), "fieldtype": "Currency"},
		{"fieldname": "balance_value", "label": _("Balance Value"), "fieldtype": "Currency"},
		{"fieldname": "value_change", "label": _("Value Change"), "fieldtype": "Currency"},
		{"fieldname": "reference_name", "label": _("Ref Name"), "fieldtype": "Data"},
		{"fieldname": "reference_type", "label": _("Ref Type"), "fieldtype": "Data"},
	]


def get_balance_columns(filters) -> list[dict]:
	return [
		{"fieldname": "index", "label": "#", "fieldtype": "Int", "width": 60},
		{"fieldname": "item", "label": _("Item"), "fieldtype": "Link", "options": "Books Item"},
		{"fieldname": "location", "label": _("Location"), "fieldtype": "Link", "options": "Books Location"},
		*_tracking_columns(show_serial_numbers=_shows_serial_numbers(filters)),
		{"fieldname": "balance_quantity", "label": _("Balance Qty."), "fieldtype": "Float"},
		{"fieldname": "balance_value", "label": _("Balance Value"), "fieldtype": "Currency"},
		{"fieldname": "opening_quantity", "label": _("Opening Qty."), "fieldtype": "Float"},
		{"fieldname": "opening_value", "label": _("Opening Value"), "fieldtype": "Currency"},
		{"fieldname": "incoming_quantity", "label": _("In Qty."), "fieldtype": "Float"},
		{"fieldname": "incoming_value", "label": _("In Value"), "fieldtype": "Currency"},
		{"fieldname": "outgoing_quantity", "label": _("Out Qty."), "fieldtype": "Float"},
		{"fieldname": "outgoing_value", "label": _("Out Value"), "fieldtype": "Currency"},
		{"fieldname": "valuation_rate", "label": _("Valuation rate"), "fieldtype": "Currency"},
	]


def _tracking_columns(show_serial_numbers):
	settings = frappe.get_cached_doc("Books Inventory Settings")
	columns = []
	if settings.enable_batches:
		columns.append(
			{"fieldname": "batch", "label": _("Batch"), "fieldtype": "Link", "options": "Books Batch"}
		)
	if settings.enable_serial_number and show_serial_numbers:
		columns.append({"fieldname": "serial_number", "label": _("Serial Number"), "fieldtype": "Data"})
	return columns


def _shows_serial_numbers(filters):
	return (
		filters.get("show_serial_numbers")
		and frappe.get_cached_doc("Books Inventory Settings").enable_serial_number
	)


def get_ledger_data(filters) -> list[dict]:
	"""Return stock ledger entries with the FIFO balances stored on each entry."""
	conditions = [
		*_key_conditions(filters),
		*datetime_conditions("date", filters.get("from_date"), filters.get("to_date")),
	]
	if filters.get("reference_type") and filters["reference_type"] != "All":
		conditions.append(["reference_type", "=", filters["reference_type"]])
	if filters.get("reference_name"):
		conditions.append(["reference_name", "=", filters["reference_name"]])
	direction = "asc" if filters.get("ascending") else "desc"
	entries = frappe.get_list(
		DOCTYPE, filters=conditions, fields=LEDGER_FIELDS, order_by=f"date {direction}, name {direction}"
	)
	return _grouped([_ledger_row(entry) for entry in entries], filters.get("group_by"))


def get_balance_data(filters) -> list[dict]:
	"""Return opening, incoming, outgoing and closing stock of each item, location and batch."""
	key_fields = ["item", "location", "batch"]
	conditions = _key_conditions(filters)
	if _shows_serial_numbers(filters):
		key_fields.append("serial_number")
		conditions.append(["serial_number", "is", "set"])
	period = [*conditions, *datetime_conditions("date", filters.get("from_date"), filters.get("to_date"))]
	balances = {}
	if filters.get("from_date"):
		_add_movement(balances, key_fields, [*conditions, ["date", "<", filters["from_date"]]], "opening")
	_add_movement(balances, key_fields, [*period, ["quantity", ">", 0]], "incoming")
	_add_movement(balances, key_fields, [*period, ["quantity", "<", 0]], "outgoing")
	rows = [_balance_row(key, key_fields, movement) for key, movement in sorted(balances.items())]
	return _numbered(
		[row for row in rows if _matches_serial_filter(row, filters.get("serial_number_filter"))]
	)


def _grouped(rows, group_by):
	"""Number the rows and, when grouped, keep each group together with a blank row between groups."""
	if group_by not in GROUP_FIELDS:
		return _numbered(rows)
	groups = {}
	for row in rows:
		groups.setdefault(row[group_by], []).append(row)
	grouped = []
	for group in groups.values():
		grouped += [*group, {}]
	_numbered([row for row in grouped if row])
	return grouped[:-1]


def _numbered(rows):
	for index, row in enumerate(rows, 1):
		row["index"] = index
	return rows


def _key_conditions(filters):
	return [[field, "=", filters[field]] for field in ("item", "location", "batch") if filters.get(field)]


def _ledger_row(entry):
	quantity = as_decimal(entry.quantity)
	return {
		"date": _system_time(entry.date),
		"item": entry.item,
		"location": entry.location,
		"batch": entry.batch or "",
		"serial_number": entry.serial_number or "",
		"quantity": quantity,
		"balance_quantity": as_decimal(entry.balance_quantity),
		"incoming_rate": _incoming_rate(entry.rate, entry.value_change, quantity),
		"valuation_rate": _valuation_rate(entry.balance_value, entry.balance_quantity),
		"balance_value": as_decimal(entry.balance_value),
		"value_change": as_decimal(entry.value_change),
		"reference_name": entry.reference_name,
		"reference_type": entry.reference_type,
	}


def _system_time(value):
	"""An entry's time with the system time zone, which /books shows in the browser's."""
	return get_datetime(value).replace(tzinfo=ZoneInfo(get_system_timezone())).isoformat()


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
		**dict(zip(key_fields, key, strict=True)),
		"balance_quantity": balance_quantity,
		"balance_value": balance_value,
		"opening_quantity": opening[0],
		"opening_value": opening[1],
		"incoming_quantity": incoming[0],
		"incoming_value": incoming[1],
		"outgoing_quantity": -outgoing[0],
		"outgoing_value": -outgoing[1],
		"valuation_rate": _valuation_rate(balance_value, balance_quantity),
	}


def _matches_serial_filter(row, serial_filter):
	if serial_filter == "In stock":
		return row["balance_quantity"] > 0
	if serial_filter == "Out stock":
		return row["balance_quantity"] <= 0
	return True


def _valuation_rate(value, quantity):
	quantity = as_decimal(quantity)
	return rounded(as_decimal(value) / quantity) if quantity else as_decimal(0)
