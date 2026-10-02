"""FIFO stock valuation stored on each stock ledger entry."""

import json
from collections import defaultdict, deque

import frappe
from frappe.query_builder import Order

from frappe_books.accounting.money import as_decimal, plain_number, rounded

DOCTYPE = "Books Stock Ledger Entry"
KEY_FIELDS = ["item", "location", "batch"]
STATE_FIELDS = ["name", "date", "quantity", "rate", "balance_quantity", "balance_value", "stock_queue"]


def insert_entry(values):
	"""Insert a stock ledger entry with its FIFO state and restate later entries; return it and the restated transactions."""
	values = frappe._dict(values)
	state = next_state(_entry_before(values, values.date), values.quantity, values.rate)
	entry = frappe.get_doc({"doctype": DOCTYPE, **values, **state}).insert(ignore_permissions=True)
	return entry, restate_after(entry, entry)


def delete_entries(reference_type, reference_name):
	"""Delete a transaction's stock ledger entries and restate later entries; return the restated transactions."""
	reference = {"reference_type": reference_type, "reference_name": reference_name}
	entries = frappe.get_all(
		DOCTYPE, filters=reference, fields=["name", "date", *KEY_FIELDS], order_by="date asc, name asc"
	)
	frappe.db.delete(DOCTYPE, reference)
	first_entries = {}
	for entry in entries:
		first_entries.setdefault(tuple(entry[field] or "" for field in KEY_FIELDS), entry)
	restated = set()
	for entry in first_entries.values():
		restated |= restate_after(entry, _entry_before(entry, entry.date, entry.name))
	return restated


def restate_after(anchor, previous):
	"""Recompute the stored state of the entries that follow the anchor in its stock key.

	Return the (reference_type, reference_name) of the transactions whose stock value changed.
	"""
	restated = set()
	for entry in _entries_after(anchor):
		state = next_state(previous, entry.quantity, entry.rate)
		if state["value_change"] != as_decimal(entry.value_change):
			restated.add((entry.reference_type, entry.reference_name))
		frappe.db.set_value(DOCTYPE, entry.name, state, update_modified=False)
		previous = frappe._dict(state)
	return restated


def revalue_entries(entries, rates):
	"""Give incoming entries new rates and restate the entries after them.

	Return the (reference_type, reference_name) of the transactions whose stock value changed.
	"""
	restated = set()
	for entry in entries:
		rate = rates[entry.name]
		# An incoming entry is worth its quantity at its rate.
		if rounded(as_decimal(entry.quantity) * rate) == as_decimal(entry.value_change):
			continue
		state = next_state(_entry_before(entry, entry.date, entry.name), entry.quantity, rate)
		frappe.db.set_value(DOCTYPE, entry.name, {"rate": rate, **state}, update_modified=False)
		restated.add((entry.reference_type, entry.reference_name))
		restated |= restate_after(entry, frappe._dict(state))
	return restated


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
		"stock_queue": json.dumps([[plain_number(value) for value in layer] for layer in layers]),
	}


def transaction_stock_value(transaction):
	"""Return the value a stock transaction moved into stock, negative when it took stock out."""
	values = frappe.get_all(
		DOCTYPE,
		filters={"reference_type": transaction.doctype, "reference_name": transaction.name},
		pluck="value_change",
	)
	return rounded(sum((as_decimal(value) for value in values), as_decimal(0)))


def transaction_entries(reference_type, reference_names):
	"""Return the transactions' stock ledger entries, each transaction's in the order it made them."""
	return frappe.get_all(
		DOCTYPE,
		filters={"reference_type": reference_type, "reference_name": ["in", reference_names]},
		fields=["name", "date", *KEY_FIELDS, "quantity", "value_change", "reference_type", "reference_name"],
		order_by="reference_name asc, name asc",
	)


def outgoing_rates(reference_type, reference_names):
	"""Map (transaction, item, batch) to the average rate at which each transaction took stock out."""
	entries = frappe.get_all(
		DOCTYPE,
		filters={
			"reference_type": reference_type,
			"reference_name": ["in", reference_names],
			"quantity": ["<", 0],
		},
		fields=["reference_name", "item", "batch", "value_change", "quantity"],
	)
	values = defaultdict(as_decimal)
	quantities = defaultdict(as_decimal)
	for entry in entries:
		key = (entry.reference_name, entry.item, entry.batch or "")
		values[key] += as_decimal(entry.value_change)
		quantities[key] += as_decimal(entry.quantity)
	return {key: values[key] / quantities[key] for key in values}


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
	return (
		_key_query(sle, anchor)
		.select(*STATE_FIELDS, sle.value_change, sle.reference_type, sle.reference_name)
		.where((sle.date > anchor.date) | ((sle.date == anchor.date) & (sle.name > anchor.name)))
		.orderby(sle.date)
		.orderby(sle.name)
	).run(as_dict=True)


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
