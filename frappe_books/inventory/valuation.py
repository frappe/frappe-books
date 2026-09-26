"""FIFO stock valuation stored on each stock ledger entry."""

import json
from collections import deque

import frappe
from frappe.query_builder import Order

from frappe_books.accounting.money import as_decimal, rounded

DOCTYPE = "Books Stock Ledger Entry"
KEY_FIELDS = ["item", "location", "batch"]
STATE_FIELDS = ["name", "date", "quantity", "rate", "balance_quantity", "balance_value", "stock_queue"]
LEDGER_FIELDS = [
	"name",
	"date",
	"item",
	"location",
	"batch",
	"serial_number",
	"quantity",
	"rate",
	"reference_type",
	"reference_name",
	"value_change",
	"balance_quantity",
	"balance_value",
]


def insert_entry(values, at_valuation_rate=False):
	"""Insert a stock ledger entry with its FIFO state and restate any later entries.

	An entry at valuation rate rejoins stock at the current valuation, or at its
	own rate when nothing is in stock.
	"""
	values = frappe._dict(values)
	previous = _entry_before(values, values.date)
	if at_valuation_rate and previous and as_decimal(previous.balance_quantity) > 0:
		values.rate = rounded(_valuation_rate(previous.balance_value, previous.balance_quantity))
	state = next_state(previous, values.quantity, values.rate)
	entry = frappe.get_doc({"doctype": DOCTYPE, **values, **state}).insert(ignore_permissions=True)
	restate_after(entry, entry)
	return entry


def delete_entries(reference_type, reference_name):
	"""Delete a transaction's stock ledger entries and restate the entries after them."""
	reference = {"reference_type": reference_type, "reference_name": reference_name}
	entries = frappe.get_all(
		DOCTYPE, filters=reference, fields=["name", "date", *KEY_FIELDS], order_by="date asc, name asc"
	)
	frappe.db.delete(DOCTYPE, reference)
	first_entries = {}
	for entry in entries:
		first_entries.setdefault(tuple(entry[field] or "" for field in KEY_FIELDS), entry)
	for entry in first_entries.values():
		restate_after(entry, _entry_before(entry, entry.date, entry.name))


def restate_after(anchor, previous):
	"""Recompute the stored state of the entries that follow the anchor in its stock key."""
	for entry in _entries_after(anchor):
		state = next_state(previous, entry.quantity, entry.rate)
		frappe.db.set_value(DOCTYPE, entry.name, state, update_modified=False)
		previous = frappe._dict(state)


def next_state(previous, quantity, rate):
	quantity = as_decimal(quantity)
	opening_value = as_decimal(previous.balance_value) if previous else as_decimal(0)
	balance_quantity = (as_decimal(previous.balance_quantity) if previous else as_decimal(0)) + quantity
	layers = deque(
		[as_decimal(layer_quantity), as_decimal(layer_rate)]
		for layer_quantity, layer_rate in json.loads(previous.stock_queue if previous else "[]")
	)
	value_change = rounded(_consume_layers(layers, quantity, as_decimal(rate)))
	if quantity < 0 and balance_quantity == 0:
		# Clear the cents left behind by rounding each outgoing entry.
		value_change = -opening_value
	return {
		"value_change": value_change,
		"balance_quantity": balance_quantity,
		"balance_value": opening_value + value_change,
		"stock_queue": json.dumps([[_plain(value) for value in layer] for layer in layers]),
	}


def transaction_stock_value(transaction):
	"""Return the value a stock transaction moved in or out of stock."""
	values = frappe.get_all(
		DOCTYPE,
		filters={"reference_type": transaction.doctype, "reference_name": transaction.name},
		pluck="value_change",
	)
	return abs(rounded(sum((as_decimal(value) for value in values), as_decimal(0))))


def computed_entries(items):
	"""Return the stock ledger rows of the given items with their stored FIFO balances."""
	entries = frappe.get_all(
		DOCTYPE, filters={"item": ["in", items]}, fields=LEDGER_FIELDS, order_by="date asc, name asc"
	)
	return [
		{
			**entry,
			"incoming_rate": rounded(entry.rate if entry.quantity > 0 else 0),
			"valuation_rate": rounded(_valuation_rate(entry.balance_value, entry.balance_quantity)),
		}
		for entry in entries
	]


def _entry_before(row, date, name=None):
	"""Return the latest entry of the row's stock key before a position; a new entry goes last on its date."""
	sle = frappe.qb.DocType(DOCTYPE)
	same_date = sle.date == date
	if name:
		same_date &= sle.name < name
	entries = (
		_key_query(sle, row)
		.select(*STATE_FIELDS)
		.where((sle.date < date) | same_date)
		.orderby(sle.date, order=Order.desc)
		.orderby(sle.name, order=Order.desc)
		.limit(1)
	).run(as_dict=True)
	return entries[0] if entries else None


def _entries_after(anchor):
	sle = frappe.qb.DocType(DOCTYPE)
	query = _key_query(sle, anchor).select(*STATE_FIELDS).orderby(sle.date).orderby(sle.name)
	if anchor.get("name"):
		query = query.where((sle.date > anchor.date) | ((sle.date == anchor.date) & (sle.name > anchor.name)))
	return query.run(as_dict=True)


def _key_query(sle, row):
	batch = (sle.batch == row.batch) if row.batch else (sle.batch.isnull() | (sle.batch == ""))
	return frappe.qb.from_(sle).where((sle.item == row.item) & (sle.location == row.location) & batch)


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


def _valuation_rate(value, quantity):
	return as_decimal(value) / as_decimal(quantity) if as_decimal(quantity) else as_decimal(0)


def _plain(value):
	return format(value.normalize(), "f")
