"""FIFO stock valuation stored on each stock ledger entry."""

import json
from collections import defaultdict, deque
from decimal import ROUND_HALF_UP

import frappe
from frappe.query_builder import Order

from frappe_books.accounting.money import as_decimal, currency_unit, plain_number, rounded

DOCTYPE = "Books Stock Ledger Entry"
KEY_FIELDS = ["item_code", "warehouse", "batch_no"]
STATE_FIELDS = [
	"name",
	"posting_datetime",
	"actual_qty",
	"incoming_rate",
	"qty_after_transaction",
	"stock_value",
	"stock_queue",
]


def insert_entry(values):
	"""Insert a stock ledger entry with its FIFO state and restate later entries; return it and the restated transactions."""
	values = frappe._dict(values)
	previous = _entry_before(values, values.posting_datetime)
	state = next_state(previous, values.actual_qty, values.incoming_rate, currency_unit())
	entry = frappe.get_doc({"doctype": DOCTYPE, **values, **state}).insert(ignore_permissions=True)
	return entry, restate_after(entry, entry)


def delete_entries(voucher_type, voucher_no):
	"""Delete a transaction's stock ledger entries and restate later entries; return the restated transactions."""
	reference = {"voucher_type": voucher_type, "voucher_no": voucher_no}
	entries = frappe.get_all(
		DOCTYPE,
		filters=reference,
		fields=["name", "posting_datetime", *KEY_FIELDS],
		order_by="posting_datetime asc, name asc",
	)
	frappe.db.delete(DOCTYPE, reference)
	first_entries = {}
	for entry in entries:
		first_entries.setdefault(tuple(entry[field] or "" for field in KEY_FIELDS), entry)
	restated = set()
	for entry in first_entries.values():
		restated |= restate_after(entry, _entry_before(entry, entry.posting_datetime, entry.name))
	return restated


def restate_after(anchor, previous):
	"""Recompute the stored state of the entries that follow the anchor in its stock key.

	Return the (voucher_type, voucher_no) of the transactions whose stock value changed.
	"""
	restated = set()
	unit = currency_unit()
	for entry in _entries_after(anchor):
		state = next_state(previous, entry.actual_qty, entry.incoming_rate, unit)
		if state["stock_value_difference"] != as_decimal(entry.stock_value_difference):
			restated.add((entry.voucher_type, entry.voucher_no))
		frappe.db.set_value(DOCTYPE, entry.name, state, update_modified=False)
		previous = frappe._dict(state)
	return restated


def revalue_entries(entries, rates):
	"""Give incoming entries new rates and restate the entries after them.

	Return the (voucher_type, voucher_no) of the transactions whose stock value changed.
	"""
	restated = set()
	unit = currency_unit()
	for entry in entries:
		rate = rates[entry.name]
		# An incoming entry is worth its quantity at its rate.
		if rounded(as_decimal(entry.actual_qty) * rate) == as_decimal(entry.stock_value_difference):
			continue
		state = next_state(
			_entry_before(entry, entry.posting_datetime, entry.name), entry.actual_qty, rate, unit
		)
		frappe.db.set_value(DOCTYPE, entry.name, {"incoming_rate": rate, **state}, update_modified=False)
		restated.add((entry.voucher_type, entry.voucher_no))
		restated |= restate_after(entry, frappe._dict(state))
	return restated


def next_state(previous, quantity, rate, unit):
	"""Return the FIFO state after an entry of `quantity` at `rate`, with its value rounded to `unit`."""
	quantity = as_decimal(quantity)
	opening_value = as_decimal(previous.stock_value) if previous else as_decimal(0)
	balance_qty = (as_decimal(previous.qty_after_transaction) if previous else as_decimal(0)) + quantity
	layers = deque(
		[as_decimal(layer_quantity), as_decimal(layer_rate)]
		for layer_quantity, layer_rate in json.loads(previous.stock_queue if previous else "[]")
	)
	value_change = _consume_layers(layers, quantity, as_decimal(rate)).quantize(unit, rounding=ROUND_HALF_UP)
	if quantity < 0 and balance_qty == 0:
		# Clear the cents left behind by rounding each outgoing entry.
		value_change = -opening_value
	return {
		"stock_value_difference": value_change,
		"qty_after_transaction": balance_qty,
		"stock_value": opening_value + value_change,
		"stock_queue": json.dumps([[plain_number(value) for value in layer] for layer in layers]),
	}


def transaction_stock_value(transaction):
	"""Return the value a stock transaction moved into stock, negative when it took stock out."""
	values = frappe.get_all(
		DOCTYPE,
		filters={"voucher_type": transaction.doctype, "voucher_no": transaction.name},
		pluck="stock_value_difference",
	)
	return rounded(sum((as_decimal(value) for value in values), as_decimal(0)))


def transaction_entries(voucher_type, voucher_nos):
	"""Return the transactions' stock ledger entries, each transaction's in the order it made them."""
	return frappe.get_all(
		DOCTYPE,
		filters={"voucher_type": voucher_type, "voucher_no": ["in", voucher_nos]},
		fields=[
			"name",
			"posting_datetime",
			*KEY_FIELDS,
			"actual_qty",
			"stock_value_difference",
			"voucher_type",
			"voucher_no",
		],
		order_by="voucher_no asc, name asc",
	)


def outgoing_rates(voucher_type, voucher_nos):
	"""Map (transaction, item, batch) to the average rate at which each transaction took stock out."""
	entries = frappe.get_all(
		DOCTYPE,
		filters={
			"voucher_type": voucher_type,
			"voucher_no": ["in", voucher_nos],
			"actual_qty": ["<", 0],
		},
		fields=["voucher_no", "item_code", "batch_no", "stock_value_difference", "actual_qty"],
	)
	values = defaultdict(as_decimal)
	quantities = defaultdict(as_decimal)
	for entry in entries:
		key = (entry.voucher_no, entry.item_code, entry.batch_no or "")
		values[key] += as_decimal(entry.stock_value_difference)
		quantities[key] += as_decimal(entry.actual_qty)
	return {key: values[key] / quantities[key] for key in values}


def _entry_before(row, posting_datetime, name=None):
	"""Return the latest entry of the row's stock key before a position; a new entry goes last on its date."""
	sle = frappe.qb.DocType(DOCTYPE)
	same_date = sle.posting_datetime == posting_datetime
	if name:
		same_date &= sle.name < name
	entries = (
		_key_query(sle, row)
		.select(*STATE_FIELDS)
		.where((sle.posting_datetime < posting_datetime) | same_date)
		.orderby(sle.posting_datetime, order=Order.desc)
		.orderby(sle.name, order=Order.desc)
		.limit(1)
	).run(as_dict=True)
	return entries[0] if entries else None


def _entries_after(anchor):
	sle = frappe.qb.DocType(DOCTYPE)
	return (
		_key_query(sle, anchor)
		.select(*STATE_FIELDS, sle.stock_value_difference, sle.voucher_type, sle.voucher_no)
		.where(
			(sle.posting_datetime > anchor.posting_datetime)
			| ((sle.posting_datetime == anchor.posting_datetime) & (sle.name > anchor.name))
		)
		.orderby(sle.posting_datetime)
		.orderby(sle.name)
	).run(as_dict=True)


def _key_query(sle, row):
	batch = (sle.batch_no == row.batch_no) if row.batch_no else (sle.batch_no.isnull() | (sle.batch_no == ""))
	return frappe.qb.from_(sle).where(
		(sle.item_code == row.item_code) & (sle.warehouse == row.warehouse) & batch
	)


def _consume_layers(queue, quantity, rate):
	if quantity > 0:
		queue.append([quantity, rate])
		return quantity * rate
	value_change = as_decimal(0)
	remaining = abs(quantity)
	while remaining and queue:
		layer_quantity, layer_rate = queue[0]
		taken = min(remaining, layer_quantity)
		value_change -= taken * layer_rate
		remaining -= taken
		if layer_quantity > taken:
			queue[0][0] = layer_quantity - taken
		else:
			queue.popleft()
	# Stock that was never received is valued at the entry's own rate.
	return value_change - remaining * rate
