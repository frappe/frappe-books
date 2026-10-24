"""Stock row checks, availability, batches, and serial numbers."""

from collections import Counter, defaultdict

import frappe
from frappe import _
from frappe.query_builder.functions import Coalesce, Min, Sum

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.inventory.units import populate_units, stock_qty_field
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
	batch_items = _items_of("Books Batch", "item", [row.get("batch_no") for row in rows])
	for row in rows:
		_validate_batch(row, items[row["item_code"]], batch_items)


def create_series_batches(rows):
	"""Give rows of batch items without a batch a new batch named from the item's batch series.

	Runs in validate: Frappe checks links before any hook, and an empty batch passes.
	"""
	rows = [row for row in rows if row.item_code and not row.batch_no]
	batch_items = _items_with("has_batch_no", {row.item_code for row in rows})
	for row in rows:
		names = new_item_names("Books Batch", row.item_code, 1) if row.item_code in batch_items else []
		if names:
			frappe.get_doc({"doctype": "Books Batch", "batch_id": names[0], "item": row.item_code}).insert()
			row.batch_no = names[0]


def create_series_serial_numbers(rows):
	"""Top up the serial numbers of rows of serialised items to their quantity from the item's series.

	The serial numbers themselves are created when the stock arrives, on submit.
	"""
	serialised = _items_with("has_serial_no", {row.item_code for row in rows if row.item_code})
	for row in rows:
		serial_numbers = parse_serial_numbers(row.serial_no)
		missing = int(abs(as_decimal(row.get(stock_qty_field(row))))) - len(serial_numbers)
		if row.item_code in serialised and missing > 0:
			added = new_item_names("Books Serial No", row.item_code, missing)
			row.serial_no = "\n".join(serial_numbers + added) or None


def validate_stock_available(transfers, date):
	"""Lock the items, then check that outgoing rows have the stock they take at the date.

	The lock is held until commit, so concurrent postings of an item check and
	post one at a time.
	"""
	_lock_items(transfers)
	outgoing = [row for row in transfers if row.get("s_warehouse")]
	incoming = [row for row in transfers if not row.get("s_warehouse")]
	_validate_quantities_available(outgoing, date)
	_validate_serial_numbers_available(outgoing)
	_validate_serial_numbers_not_in_stock(incoming)


def reverse_transfers(transfers):
	"""Return the rows that undo the given transfers, to check stock before cancelling."""
	return [
		{
			**transfer,
			"s_warehouse": transfer.get("t_warehouse"),
			"t_warehouse": transfer.get("s_warehouse"),
		}
		for transfer in transfers
	]


def populate_stock_rows(rows):
	"""Fill item defaults and units on stock rows and return their total amount.

	A stock entry row's `basic_rate` is per stock unit; a delivery note or receipt row's `rate` per its unit.
	"""
	populate_units(rows)
	items = _item_defaults(rows)
	for row in rows:
		item = items.get(row.item_code)
		if item:
			_fill_item_defaults(row, item)
		if row.meta.has_field("basic_rate"):
			row.amount = rounded(as_decimal(row.basic_rate) * as_decimal(row.transfer_qty))
		else:
			row.amount = rounded(as_decimal(row.rate) * as_decimal(row.qty))
			row.stock_uom_rate = as_decimal(row.rate) / as_decimal(row.conversion_factor or 1)
	return rounded(sum((as_decimal(row.amount) for row in rows), as_decimal(0)))


def _fill_item_defaults(row, item):
	"""Fill the item's name, description, HSN/SAC code and standard rate where the row leaves them empty."""
	defaults = {
		"item_name": item.item_name,
		"description": item.description,
		"gst_hsn_code": item.gst_hsn_code,
		"basic_rate": item.standard_rate,
		"rate": as_decimal(item.standard_rate) * as_decimal(row.conversion_factor or 1),
	}
	for fieldname, value in defaults.items():
		df = row.meta.get_field(fieldname)
		if df and not row.get(fieldname):
			row.set(fieldname, row.cast(value, df))


def start_row_quantities(rows):
	"""A row without either quantity moves one of its unit, as a new row in /books starts."""
	for row in rows:
		if not row.qty and not row.get(stock_qty_field(row)):
			row.qty = 1


def fill_serial_numbers(rows, warehouse=None):
	"""Give serialised rows without serial numbers the earliest received ones in stock at their warehouse, else at `warehouse`."""
	serialised = _items_with("has_serial_no", {row.item_code for row in rows if not row.serial_no})
	taken = {serial for row in rows for serial in parse_serial_numbers(row.serial_no)}
	for row in rows:
		row_warehouse = row.get("warehouse") or warehouse
		if row.item_code in serialised and row_warehouse and not row.serial_no:
			count = int(abs(as_decimal(row.stock_qty)))
			picked = available_serial_numbers(row.item_code, row_warehouse, count, exclude=taken)
			taken.update(picked)
			row.serial_no = "\n".join(picked) or None


def available_serial_numbers(item, warehouse, count, exclude=()):
	"""Return up to `count` of the item's serial numbers in stock at the warehouse, earliest received first."""
	if count <= 0:
		return []
	sle = frappe.qb.DocType(LEDGER)
	in_stock = (
		frappe.qb.from_(sle)
		.select(sle.serial_no)
		.where((sle.item_code == item) & (sle.warehouse == warehouse) & sle.serial_no.isnotnull())
		.groupby(sle.serial_no)
		.having(Sum(sle.actual_qty) > 0)
		.orderby(Min(sle.posting_datetime))
		.orderby(sle.serial_no)
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
	if not transfer.get("item_code"):
		frappe.throw(_("Every stock row requires an item."))
	if abs(as_decimal(transfer.get("stock_qty"))) <= 0:
		frappe.throw(_("Quantity must be greater than zero."))
	if as_decimal(transfer.get("rate")) < 0:
		frappe.throw(_("Stock rate cannot be negative."))
	if not transfer.get("s_warehouse") and not transfer.get("t_warehouse"):
		frappe.throw(_("Set a source or target warehouse."))


def _validate_tracked_items(transfers):
	items = _item_settings(transfers)
	untracked = sorted({row["item_code"] for row in transfers if not items[row["item_code"]].is_stock_item})
	if untracked:
		frappe.throw(_("Item {0} does not track stock.").format(", ".join(untracked)))


def _validate_batch(transfer, item, batch_items):
	batch = transfer.get("batch_no")
	if item.has_batch_no and not batch:
		frappe.throw(_("Please select a batch first"))
	if batch and not item.has_batch_no:
		frappe.throw(_("Item {0} does not use batches.").format(transfer["item_code"]))
	if batch_items.get(batch) and batch_items[batch] != transfer["item_code"]:
		frappe.throw(_("Batch {0} belongs to another item.").format(batch))


def _validate_serial_numbers(transfers):
	items = _item_settings(transfers)
	serial_items = _items_of("Books Serial No", "item_code", _all_serial_numbers(transfers))
	for transfer in transfers:
		_validate_row_serial_numbers(transfer, items[transfer["item_code"]], serial_items)
	_validate_unique_serial_numbers(transfers)


def _validate_row_serial_numbers(transfer, item, serial_items):
	serial_numbers = parse_serial_numbers(transfer.get("serial_no"))
	if serial_numbers and not item.has_serial_no:
		frappe.throw(_("Item {0} does not use serial numbers.").format(transfer["item_code"]))
	quantity = abs(as_decimal(transfer["stock_qty"]))
	if item.has_serial_no and len(serial_numbers) != quantity:
		frappe.throw(
			_("Need {0} Serial Numbers for Item {1}. You have provided {2}").format(
				format_quantity(quantity), transfer["item_code"], len(serial_numbers)
			)
		)
	for serial_number in serial_numbers:
		if serial_items.get(serial_number, transfer["item_code"]) != transfer["item_code"]:
			frappe.throw(_("Serial number {0} belongs to another item.").format(serial_number))


def _validate_unique_serial_numbers(transfers):
	counts = Counter(_all_serial_numbers(transfers))
	repeated = sorted(serial_number for serial_number, count in counts.items() if count > 1)
	if repeated:
		frappe.throw(_("Serial number {0} is listed more than once.").format(", ".join(repeated)))


def _validate_quantities_available(outgoing, date):
	required = defaultdict(as_decimal)
	for transfer in outgoing:
		key = (transfer["item_code"], transfer["s_warehouse"], transfer.get("batch_no") or "")
		required[key] += abs(as_decimal(transfer["stock_qty"]))
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
	available = defaultdict(
		as_decimal, _key_totals(sle, keys, Sum(sle.actual_qty), sle.posting_datetime <= date)
	)
	for key, lowest in _key_totals(
		sle, keys, Min(sle.qty_after_transaction), sle.posting_datetime > date
	).items():
		available[key] = min(available[key], lowest)
	return available


def _key_totals(sle, keys, aggregate, condition):
	batch = Coalesce(sle.batch_no, "")
	rows = (
		frappe.qb.from_(sle)
		.select(sle.item_code, sle.warehouse, batch, aggregate)
		.where(
			sle.item_code.isin(sorted({key[0] for key in keys}))
			& sle.warehouse.isin(sorted({key[1] for key in keys}))
			& condition
		)
		.groupby(sle.item_code, sle.warehouse, batch)
	).run()
	return {(item, location, batch): as_decimal(value) for item, location, batch, value in rows}


def _validate_serial_numbers_available(outgoing):
	wanted = [
		(transfer["item_code"], transfer["s_warehouse"], serial_number)
		for transfer in outgoing
		for serial_number in parse_serial_numbers(transfer.get("serial_no"))
	]
	if not wanted:
		return
	sle = frappe.qb.DocType(LEDGER)
	rows = (
		frappe.qb.from_(sle)
		.select(sle.item_code, sle.warehouse, sle.serial_no, Sum(sle.actual_qty))
		.where(sle.serial_no.isin(sorted({key[2] for key in wanted})))
		.groupby(sle.item_code, sle.warehouse, sle.serial_no)
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
		.select(sle.serial_no)
		.where(sle.serial_no.isin(serial_numbers))
		.groupby(sle.serial_no)
		.having(Sum(sle.actual_qty) > 0)
	).run(pluck=True)
	if in_stock:
		frappe.throw(_("Serial number {0} is already in stock.").format(", ".join(sorted(in_stock))))


def _all_serial_numbers(transfers):
	return [
		serial_number
		for transfer in transfers
		for serial_number in parse_serial_numbers(transfer.get("serial_no"))
	]


def _lock_items(transfers):
	frappe.db.get_values(
		"Books Item",
		{"name": ["in", sorted({transfer["item_code"] for transfer in transfers})]},
		"name",
		order_by="name asc",
		for_update=True,
	)


def _item_settings(transfers):
	rows = frappe.get_all(
		"Books Item",
		filters={"name": ["in", sorted({transfer["item_code"] for transfer in transfers})]},
		fields=["name", "is_stock_item", "has_batch_no", "has_serial_no"],
	)
	return {row.name: row for row in rows}


def _item_defaults(rows):
	names = sorted({row.item_code for row in rows if row.item_code})
	if not names:
		return {}
	items = frappe.get_all(
		"Books Item",
		filters={"name": ["in", names]},
		fields=["name", "item_name", "description", "standard_rate", "gst_hsn_code"],
	)
	return {item.name: item for item in items}


def _items_with(flag, names):
	"""Return the named items that have the flag, such as has_batch_no, set."""
	if not names:
		return set()
	return set(frappe.get_all("Books Item", filters={"name": ["in", sorted(names)], flag: 1}, pluck="name"))


def _items_of(doctype, item_field, names):
	"""Map the given batches or serial numbers to their items, held in `item_field`."""
	names = sorted(set(filter(None, names)))
	if not names:
		return {}
	return dict(
		frappe.get_all(doctype, filters={"name": ["in", names]}, fields=["name", item_field], as_list=True)
	)
