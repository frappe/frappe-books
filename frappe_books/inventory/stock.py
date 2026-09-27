"""Stock-ledger creation, availability checks, batches, and serial numbers."""

from collections import Counter, defaultdict
from decimal import Decimal

import frappe
from frappe import _
from frappe.query_builder.functions import Coalesce, Min, Sum

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.inventory.units import populate_units
from frappe_books.inventory.valuation import delete_entries, insert_entry

LEDGER = "Books Stock Ledger Entry"


def validate_transfer_rows(transfers):
	"""Check row values, batches and serial numbers; stock levels are checked on submit."""
	if not transfers:
		frappe.throw(_("At least one stock item is required."))
	for transfer in transfers:
		_validate_row(transfer)
	_validate_tracked_items(transfers)
	validate_batches(transfers)
	_validate_serial_numbers(transfers)


def validate_batches(rows):
	"""Check each row names a batch of its item exactly when the item uses batches."""
	items = _item_settings(rows)
	batch_items = _items_of("Books Batch", [row.get("batch") for row in rows])
	for row in rows:
		_validate_batch(row, items[row["item"]], batch_items)


def validate_stock_available(transfers, date):
	"""Lock the items, then check that outgoing rows have the stock they take at the date.

	The lock is held until commit, so concurrent postings of an item check and
	post one at a time.
	"""
	_lock_items(transfers)
	outgoing = [row for row in transfers if row.get("from_location")]
	incoming = [row for row in transfers if not row.get("from_location")]
	_validate_quantities_available(outgoing, date)
	_validate_serial_numbers_available(outgoing)
	_validate_serial_numbers_not_in_stock(incoming)


def reverse_transfers(transfers):
	"""Return the rows that undo the given transfers, to check stock before cancelling."""
	return [
		{
			**transfer,
			"from_location": transfer.get("to_location"),
			"to_location": transfer.get("from_location"),
		}
		for transfer in transfers
	]


def create_stock_entries(transaction, transfers):
	"""Insert the transfers' stock ledger entries and return the other transactions they restated."""
	restated = set()
	for transfer in transfers:
		serial_numbers = parse_serial_numbers(transfer.get("serial_number"))
		_update_serial_statuses(transaction, transfer, serial_numbers, cancel=False)
		if serial_numbers:
			for serial_number in serial_numbers:
				restated |= _create_location_entries(transaction, transfer, Decimal(1), serial_number)
		else:
			quantity = abs(as_decimal(transfer["quantity"]))
			restated |= _create_location_entries(transaction, transfer, quantity, None)
	restated.discard((transaction.doctype, transaction.name))
	return restated


def cancel_stock_entries(transaction, transfers):
	"""Delete the transaction's stock ledger entries and return the transactions they restated."""
	for transfer in transfers:
		_update_serial_statuses(
			transaction,
			transfer,
			parse_serial_numbers(transfer.get("serial_number")),
			cancel=True,
		)
	return delete_stock_entries(transaction)


def delete_stock_entries(transaction):
	return delete_entries(transaction.doctype, transaction.name)


def populate_stock_rows(rows):
	"""Fill item defaults and units on stock rows and return their total amount."""
	populate_units(rows)
	items = _item_defaults(rows)
	for row in rows:
		item = items.get(row.item)
		if not item:
			continue
		for fieldname in ("description", "rate"):
			if not row.get(fieldname):
				row.set(fieldname, item.get(fieldname))
		row.amount = rounded(as_decimal(row.rate) * as_decimal(row.quantity))
	return rounded(sum((as_decimal(row.amount) for row in rows), as_decimal(0)))


def parse_serial_numbers(value):
	if not value:
		return []
	return [line.strip() for line in str(value).replace(",", "\n").splitlines() if line.strip()]


def _validate_row(transfer):
	if not transfer.get("item"):
		frappe.throw(_("Every stock row requires an item."))
	if abs(as_decimal(transfer.get("quantity"))) <= 0:
		frappe.throw(_("Stock quantity must be greater than zero."))
	if as_decimal(transfer.get("rate")) < 0:
		frappe.throw(_("Stock rate cannot be negative."))
	if not transfer.get("from_location") and not transfer.get("to_location"):
		frappe.throw(_("Set a source or destination location."))


def _validate_tracked_items(transfers):
	items = _item_settings(transfers)
	untracked = sorted({row["item"] for row in transfers if not items[row["item"]].track_item})
	if untracked:
		frappe.throw(_("Item {0} does not track stock.").format(", ".join(untracked)))


def _validate_batch(transfer, item, batch_items):
	batch = transfer.get("batch")
	if item.has_batch and not batch:
		frappe.throw(_("Item {0} requires a batch.").format(transfer["item"]))
	if batch and not item.has_batch:
		frappe.throw(_("Item {0} does not use batches.").format(transfer["item"]))
	if batch_items.get(batch) and batch_items[batch] != transfer["item"]:
		frappe.throw(_("Batch {0} belongs to another item.").format(batch))


def _validate_serial_numbers(transfers):
	items = _item_settings(transfers)
	serial_items = _items_of("Books Serial Number", _all_serial_numbers(transfers))
	for transfer in transfers:
		_validate_row_serial_numbers(transfer, items[transfer["item"]], serial_items)
	_validate_unique_serial_numbers(transfers)


def _validate_row_serial_numbers(transfer, item, serial_items):
	serial_numbers = parse_serial_numbers(transfer.get("serial_number"))
	if serial_numbers and not item.has_serial_number:
		frappe.throw(_("Item {0} does not use serial numbers.").format(transfer["item"]))
	if item.has_serial_number and len(serial_numbers) != abs(as_decimal(transfer["quantity"])):
		frappe.throw(_("Serial-number count must equal stock quantity."))
	for serial_number in serial_numbers:
		if serial_items.get(serial_number, transfer["item"]) != transfer["item"]:
			frappe.throw(_("Serial number {0} belongs to another item.").format(serial_number))


def _validate_unique_serial_numbers(transfers):
	counts = Counter(_all_serial_numbers(transfers))
	repeated = sorted(serial_number for serial_number, count in counts.items() if count > 1)
	if repeated:
		frappe.throw(_("Serial number {0} is listed more than once.").format(", ".join(repeated)))


def _validate_quantities_available(outgoing, date):
	required = defaultdict(as_decimal)
	for transfer in outgoing:
		key = (transfer["item"], transfer["from_location"], transfer.get("batch") or "")
		required[key] += abs(as_decimal(transfer["quantity"]))
	available = _available_quantities(required, date)
	for key, quantity in required.items():
		if available[key] < quantity:
			frappe.throw(
				_("Insufficient stock for {0} at {1}: {2} available, {3} required.").format(
					key[0], key[1], available[key], quantity
				)
			)


def _available_quantities(keys, date):
	"""Return each key's stock at the date, capped by the lowest balance of its later entries."""
	if not keys:
		return defaultdict(as_decimal)
	sle = frappe.qb.DocType(LEDGER)
	available = defaultdict(as_decimal, _key_totals(sle, keys, Sum(sle.quantity), sle.date <= date))
	for key, lowest in _key_totals(sle, keys, Min(sle.balance_quantity), sle.date > date).items():
		available[key] = min(available[key], lowest)
	return available


def _key_totals(sle, keys, aggregate, condition):
	batch = Coalesce(sle.batch, "")
	rows = (
		frappe.qb.from_(sle)
		.select(sle.item, sle.location, batch, aggregate)
		.where(
			sle.item.isin(sorted({key[0] for key in keys}))
			& sle.location.isin(sorted({key[1] for key in keys}))
			& condition
		)
		.groupby(sle.item, sle.location, batch)
	).run()
	return {(item, location, batch): as_decimal(value) for item, location, batch, value in rows}


def _validate_serial_numbers_available(outgoing):
	wanted = [
		(transfer["item"], transfer["from_location"], serial_number)
		for transfer in outgoing
		for serial_number in parse_serial_numbers(transfer.get("serial_number"))
	]
	if not wanted:
		return
	sle = frappe.qb.DocType(LEDGER)
	rows = (
		frappe.qb.from_(sle)
		.select(sle.item, sle.location, sle.serial_number, Sum(sle.quantity))
		.where(sle.serial_number.isin(sorted({key[2] for key in wanted})))
		.groupby(sle.item, sle.location, sle.serial_number)
	).run()
	available = {(item, location, serial): as_decimal(quantity) for item, location, serial, quantity in rows}
	for key in wanted:
		if available.get(key, 0) < 1:
			frappe.throw(_("Serial number {0} is not available at the source.").format(key[2]))


def _validate_serial_numbers_not_in_stock(incoming):
	serial_numbers = sorted(set(_all_serial_numbers(incoming)))
	if not serial_numbers:
		return
	sle = frappe.qb.DocType(LEDGER)
	in_stock = (
		frappe.qb.from_(sle)
		.select(sle.serial_number)
		.where(sle.serial_number.isin(serial_numbers))
		.groupby(sle.serial_number)
		.having(Sum(sle.quantity) > 0)
	).run(pluck=True)
	if in_stock:
		frappe.throw(_("Serial number {0} is already in stock.").format(", ".join(sorted(in_stock))))


def _all_serial_numbers(transfers):
	return [
		serial_number
		for transfer in transfers
		for serial_number in parse_serial_numbers(transfer.get("serial_number"))
	]


def _lock_items(transfers):
	frappe.db.get_values(
		"Books Item",
		{"name": ["in", sorted({transfer["item"] for transfer in transfers})]},
		"name",
		order_by="name asc",
		for_update=True,
	)


def _item_settings(transfers):
	rows = frappe.get_all(
		"Books Item",
		filters={"name": ["in", sorted({transfer["item"] for transfer in transfers})]},
		fields=["name", "track_item", "has_batch", "has_serial_number"],
	)
	return {row.name: row for row in rows}


def _item_defaults(rows):
	names = sorted({row.item for row in rows if row.item})
	if not names:
		return {}
	items = frappe.get_all(
		"Books Item", filters={"name": ["in", names]}, fields=["name", "description", "rate"]
	)
	return {item.name: item for item in items}


def _items_of(doctype, names):
	"""Map the given batches or serial numbers to their items."""
	names = sorted(set(filter(None, names)))
	if not names:
		return {}
	return dict(
		frappe.get_all(doctype, filters={"name": ["in", names]}, fields=["name", "item"], as_list=True)
	)


def _create_location_entries(transaction, transfer, quantity, serial_number):
	restated = set()
	if transfer.get("from_location"):
		restated |= _create_stock_entry(
			transaction, transfer, transfer["from_location"], -quantity, serial_number
		)
	if transfer.get("to_location"):
		restated |= _create_stock_entry(
			transaction, transfer, transfer["to_location"], quantity, serial_number
		)
	return restated


def _create_stock_entry(transaction, transfer, location, quantity, serial_number):
	return insert_entry(
		{
			"date": transaction.date,
			"location": location,
			"batch": transfer.get("batch"),
			"serial_number": serial_number,
			"item": transfer["item"],
			"rate": rounded(transfer["rate"]),
			"quantity": quantity,
			"reference_type": transaction.doctype,
			"reference_name": transaction.name,
		}
	)


def _update_serial_statuses(transaction, transfer, serial_numbers, cancel):
	if not serial_numbers:
		return
	if transfer.get("to_location") and not cancel:
		_create_serial_numbers(transfer["item"], serial_numbers)
	frappe.db.set_value(
		"Books Serial Number",
		{"name": ["in", serial_numbers]},
		"status",
		_serial_status(transaction, transfer, cancel),
	)


def _create_serial_numbers(item, serial_numbers):
	existing = set(
		frappe.get_all("Books Serial Number", filters={"name": ["in", serial_numbers]}, pluck="name")
	)
	for serial_number in serial_numbers:
		if serial_number not in existing:
			frappe.get_doc(
				{"doctype": "Books Serial Number", "name": serial_number, "item": item, "status": "Active"}
			).insert(ignore_permissions=True)


def _serial_status(transaction, transfer, cancel):
	if cancel:
		return "Active" if transfer.get("from_location") else "Inactive"
	if transfer.get("from_location") and not transfer.get("to_location"):
		return "Delivered" if transaction.doctype == "Books Shipment" else "Inactive"
	return "Active"
