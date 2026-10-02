"""Stock-ledger creation, availability checks, batches, and serial numbers."""

from collections import Counter, defaultdict
from decimal import Decimal

import frappe
from frappe import _
from frappe.query_builder.functions import Coalesce, Min, Sum

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.inventory.units import populate_units
from frappe_books.inventory.valuation import delete_entries, insert_entry
from frappe_books.series import new_item_names

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


def create_series_batches(rows):
	"""Give rows of batch items without a batch a new batch named from the item's batch series.

	Runs in validate: Frappe checks links before any hook, and an empty batch passes.
	"""
	rows = [row for row in rows if row.item and not row.batch]
	batch_items = _items_with("has_batch", {row.item for row in rows})
	for row in rows:
		names = new_item_names("Books Batch", row.item, 1) if row.item in batch_items else []
		if names:
			frappe.get_doc({"doctype": "Books Batch", "name": names[0], "item": row.item}).insert()
			row.batch = names[0]


def create_series_serial_numbers(rows):
	"""Top up the serial numbers of rows of serialised items to their quantity from the item's series.

	The serial numbers themselves are created when the stock arrives, on submit.
	"""
	serialised = _items_with("has_serial_number", {row.item for row in rows if row.item})
	for row in rows:
		serial_numbers = parse_serial_numbers(row.serial_number)
		missing = int(abs(as_decimal(row.quantity))) - len(serial_numbers)
		if row.item in serialised and missing > 0:
			added = new_item_names("Books Serial Number", row.item, missing)
			row.serial_number = "\n".join(serial_numbers + added) or None


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
		for fieldname in ("description", "rate", "hsn_code"):
			df = row.meta.get_field(fieldname)
			if df and not row.get(fieldname):
				row.set(fieldname, row.cast(item.get(fieldname), df))
		row.amount = rounded(as_decimal(row.rate) * as_decimal(row.quantity))
	return rounded(sum((as_decimal(row.amount) for row in rows), as_decimal(0)))


def start_row_quantities(rows):
	"""A row without either quantity moves one of its unit, as a new row in /books starts."""
	for row in rows:
		if not row.quantity and not row.transfer_quantity:
			row.quantity = 1


def fill_serial_numbers(rows, location=None):
	"""Give serialised rows without serial numbers the earliest received ones in stock at their location, else at `location`."""
	serialised = _items_with("has_serial_number", {row.item for row in rows if not row.serial_number})
	taken = set(_all_serial_numbers(rows))
	for row in rows:
		row_location = row.get("location") or location
		if row.item in serialised and row_location and not row.serial_number:
			count = int(abs(as_decimal(row.quantity)))
			picked = available_serial_numbers(row.item, row_location, count, exclude=taken)
			taken.update(picked)
			row.serial_number = "\n".join(picked) or None


def available_serial_numbers(item, location, count, exclude=()):
	"""Return up to `count` of the item's serial numbers in stock at the location, earliest received first."""
	if count <= 0:
		return []
	sle = frappe.qb.DocType(LEDGER)
	in_stock = (
		frappe.qb.from_(sle)
		.select(sle.serial_number)
		.where((sle.item == item) & (sle.location == location) & sle.serial_number.isnotnull())
		.groupby(sle.serial_number)
		.having(Sum(sle.quantity) > 0)
		.orderby(Min(sle.date))
		.orderby(sle.serial_number)
		.limit(count + len(exclude))
	).run(pluck=True)
	return [serial_number for serial_number in in_stock if serial_number not in exclude][:count]


def insufficient_stock_message(item, location, batch, available, required):
	location_text = " " + _("in {0}").format(location) if location else ""
	batch_text = " " + _("for batch {0}").format(batch) if batch else ""
	return _("Insufficient stock for {0}{1}{2}. Available: {3}; required: {4}.").format(
		item, location_text, batch_text, format_quantity(available), format_quantity(required)
	)


def format_quantity(value):
	"""A quantity as /books shows it in messages: 4, not 4.000."""
	return f"{as_decimal(value).normalize():f}"


def parse_serial_numbers(value):
	if not value:
		return []
	return [line.strip() for line in str(value).replace(",", "\n").splitlines() if line.strip()]


def _validate_row(transfer):
	if not transfer.get("item"):
		frappe.throw(_("Every stock row requires an item."))
	if abs(as_decimal(transfer.get("quantity"))) <= 0:
		frappe.throw(_("Quantity must be greater than zero."))
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
		frappe.throw(_("Please select a batch first"))
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
	quantity = abs(as_decimal(transfer["quantity"]))
	if item.has_serial_number and len(serial_numbers) != quantity:
		frappe.throw(
			_("Need {0} Serial Numbers for Item {1}. You have provided {2}").format(
				format_quantity(quantity), transfer["item"], len(serial_numbers)
			)
		)
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
	for (item, location, batch), quantity in required.items():
		if available[item, location, batch] < quantity:
			frappe.throw(
				insufficient_stock_message(item, location, batch, available[item, location, batch], quantity)
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
		"Books Item", filters={"name": ["in", names]}, fields=["name", "description", "rate", "hsn_code"]
	)
	return {item.name: item for item in items}


def _items_with(flag, names):
	"""Return the named items that have the flag, such as has_batch, set."""
	if not names:
		return set()
	return set(frappe.get_all("Books Item", filters={"name": ["in", sorted(names)], flag: 1}, pluck="name"))


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
	rate = rounded(transfer["rate"])
	if transfer.get("from_location"):
		entry, taken = _create_stock_entry(
			transaction, transfer, transfer["from_location"], -quantity, serial_number, rate
		)
		restated |= taken
		# Stock moved between locations keeps the cost it left with.
		rate = -as_decimal(entry.value_change) / quantity
	if transfer.get("to_location"):
		_entry, added = _create_stock_entry(
			transaction, transfer, transfer["to_location"], quantity, serial_number, rate
		)
		restated |= added
	return restated


def _create_stock_entry(transaction, transfer, location, quantity, serial_number, rate):
	return insert_entry(
		{
			"date": transaction.date,
			"location": location,
			"batch": transfer.get("batch"),
			"serial_number": serial_number,
			"item": transfer["item"],
			"rate": rate,
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
	if cancel and transfer.get("from_location"):
		return "Active"
	# Stock leaves: shipped or issued, or taken back out by cancelling a return or receipt.
	if cancel or (transfer.get("from_location") and not transfer.get("to_location")):
		return "Delivered" if transaction.doctype == "Books Shipment" else "Inactive"
	return "Active"
