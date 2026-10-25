from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.utils import get_datetime, get_system_timezone

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.reports.filters import datetime_conditions

DOCTYPE = "Books Stock Ledger Entry"
LEDGER_FIELDS = [
	"posting_datetime",
	"item_code",
	"warehouse",
	"batch_no",
	"serial_no",
	"actual_qty",
	"qty_after_transaction",
	"voucher_type",
	"voucher_no",
]
LEDGER_VALUE_FIELDS = ["incoming_rate", "stock_value_difference", "stock_value"]
KEY_FIELDS = ("item_code", "warehouse", "batch_no")
GROUP_FIELDS = ("item_code", "warehouse", "voucher_no")
QUANTITY_SUM = {"SUM": "actual_qty", "as": "actual_qty"}
VALUE_SUM = {"SUM": "stock_value_difference", "as": "value"}
# Columns that show what stock is worth
VALUE_COLUMNS = {
	"incoming_rate",
	"valuation_rate",
	"stock_value",
	"stock_value_difference",
	"balance_value",
	"opening_value",
	"incoming_value",
	"outgoing_value",
}


def shows_stock_values() -> bool:
	"""Whether the user may see what stock is worth; its value fields are on permlevel 1."""
	return 1 in frappe.get_meta(DOCTYPE).get_permlevel_access()


def get_ledger_columns() -> list[dict]:
	columns = [
		{"fieldname": "index", "label": "#", "fieldtype": "Int", "width": 60},
		{"fieldname": "date", "label": _("Date"), "fieldtype": "Datetime", "width": 150},
		{"fieldname": "item_code", "label": _("Item"), "fieldtype": "Link", "options": "Books Item"},
		{
			"fieldname": "warehouse",
			"label": _("Warehouse"),
			"fieldtype": "Link",
			"options": "Books Warehouse",
		},
		*_tracking_columns(show_serial_numbers=True),
		{"fieldname": "actual_qty", "label": _("Quantity"), "fieldtype": "Float"},
		{"fieldname": "qty_after_transaction", "label": _("Balance Qty."), "fieldtype": "Float"},
		{"fieldname": "incoming_rate", "label": _("Incoming rate"), "fieldtype": "Currency"},
		{"fieldname": "valuation_rate", "label": _("Valuation Rate"), "fieldtype": "Currency"},
		{"fieldname": "stock_value", "label": _("Balance Value"), "fieldtype": "Currency"},
		{"fieldname": "stock_value_difference", "label": _("Value Change"), "fieldtype": "Currency"},
		{"fieldname": "voucher_no", "label": _("Ref Name"), "fieldtype": "Data"},
		{"fieldname": "voucher_type", "label": _("Ref Type"), "fieldtype": "Data"},
	]
	return _visible_columns(columns)


def get_balance_columns(filters) -> list[dict]:
	columns = [
		{"fieldname": "index", "label": "#", "fieldtype": "Int", "width": 60},
		{"fieldname": "item_code", "label": _("Item"), "fieldtype": "Link", "options": "Books Item"},
		{
			"fieldname": "warehouse",
			"label": _("Warehouse"),
			"fieldtype": "Link",
			"options": "Books Warehouse",
		},
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
	return _visible_columns(columns)


def _tracking_columns(show_serial_numbers):
	settings = frappe.get_cached_doc("Books Inventory Settings")
	columns = []
	if settings.enable_batches:
		columns.append(
			{"fieldname": "batch_no", "label": _("Batch"), "fieldtype": "Link", "options": "Books Batch"}
		)
	if settings.enable_serial_number and show_serial_numbers:
		columns.append({"fieldname": "serial_no", "label": _("Serial Number"), "fieldtype": "Data"})
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
		*datetime_conditions("posting_datetime", filters.get("from_date"), filters.get("to_date")),
	]
	if filters.get("voucher_type") and filters["voucher_type"] != "All":
		conditions.append(["voucher_type", "=", filters["voucher_type"]])
	if filters.get("voucher_no"):
		conditions.append(["voucher_no", "=", filters["voucher_no"]])
	direction = "asc" if filters.get("ascending") else "desc"
	fields = [*LEDGER_FIELDS, *_value_fields(LEDGER_VALUE_FIELDS)]
	entries = frappe.get_list(
		DOCTYPE,
		filters=conditions,
		fields=fields,
		order_by=f"posting_datetime {direction}, name {direction}",
	)
	return _visible_values(_grouped([_ledger_row(entry) for entry in entries], filters.get("group_by")))


def get_balance_data(filters) -> list[dict]:
	"""Return opening, incoming, outgoing and closing stock of each item, warehouse and batch."""
	key_fields = list(KEY_FIELDS)
	conditions = _key_conditions(filters)
	if _shows_serial_numbers(filters):
		key_fields.append("serial_no")
		conditions.append(["serial_no", "is", "set"])
	period = [
		*conditions,
		*datetime_conditions("posting_datetime", filters.get("from_date"), filters.get("to_date")),
	]
	balances = {}
	if filters.get("from_date"):
		opening = [*conditions, ["posting_datetime", "<", filters["from_date"]]]
		_add_movement(balances, key_fields, opening, "opening")
	_add_movement(balances, key_fields, [*period, ["actual_qty", ">", 0]], "incoming")
	_add_movement(balances, key_fields, [*period, ["actual_qty", "<", 0]], "outgoing")
	rows = [_balance_row(key, key_fields, movement) for key, movement in sorted(balances.items())]
	rows = [row for row in rows if _matches_serial_filter(row, filters.get("serial_number_filter"))]
	return _visible_values(_numbered(rows))


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
	return [[field, "=", filters[field]] for field in KEY_FIELDS if filters.get(field)]


def _ledger_row(entry):
	quantity = as_decimal(entry.actual_qty)
	return {
		"date": _system_time(entry.posting_datetime),
		"item_code": entry.item_code,
		"warehouse": entry.warehouse,
		"batch_no": entry.batch_no or "",
		"serial_no": entry.serial_no or "",
		"actual_qty": quantity,
		"qty_after_transaction": as_decimal(entry.qty_after_transaction),
		"incoming_rate": _incoming_rate(entry.incoming_rate, entry.stock_value_difference, quantity),
		"valuation_rate": _valuation_rate(entry.stock_value, entry.qty_after_transaction),
		"stock_value": as_decimal(entry.stock_value),
		"stock_value_difference": as_decimal(entry.stock_value_difference),
		"voucher_no": entry.voucher_no,
		"voucher_type": entry.voucher_type,
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
	fields = [*key_fields, QUANTITY_SUM, *_value_fields([VALUE_SUM])]
	rows = frappe.get_list(DOCTYPE, filters=conditions, fields=fields, group_by=group_by, order_by=group_by)
	for row in rows:
		key = tuple(row[field] or "" for field in key_fields)
		balances.setdefault(key, {})[column] = (as_decimal(row.actual_qty), as_decimal(row.value))


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


def _value_fields(fields):
	return fields if shows_stock_values() else []


def _visible_columns(columns):
	if shows_stock_values():
		return columns
	return [column for column in columns if column["fieldname"] not in VALUE_COLUMNS]


def _visible_values(rows):
	if shows_stock_values():
		return rows
	return [{key: value for key, value in row.items() if key not in VALUE_COLUMNS} for row in rows]
