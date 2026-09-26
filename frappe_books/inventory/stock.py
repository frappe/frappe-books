"""Stock-ledger creation, availability checks, batches, and serial numbers."""

from decimal import Decimal

import frappe
from frappe import _

from frappe_books.accounting.money import as_decimal, rounded


def stock_quantity(item, location, batch=None, serial_number=None):
	filters = {"item": item, "location": location}
	if batch:
		filters["batch"] = batch
	if serial_number:
		filters["serial_number"] = serial_number
	quantities = frappe.get_all("Books Stock Ledger Entry", filters=filters, pluck="quantity")
	return sum((as_decimal(quantity) for quantity in quantities), Decimal())


def validate_transfer_rows(transaction, transfers):
	if not transfers:
		frappe.throw(_("At least one stock item is required."))
	for transfer in transfers:
		_validate_transfer(transaction, transfer)


def create_stock_entries(transaction, transfers):
	for transfer in transfers:
		serial_numbers = parse_serial_numbers(transfer.get("serial_number"))
		_update_serial_statuses(transaction, transfer, serial_numbers, cancel=False)
		if serial_numbers:
			for serial_number in serial_numbers:
				_create_location_entries(transaction, transfer, Decimal(1), serial_number)
		else:
			_create_location_entries(
				transaction,
				transfer,
				abs(as_decimal(transfer["quantity"])),
				None,
			)


def cancel_stock_entries(transaction, transfers):
	for transfer in transfers:
		_update_serial_statuses(
			transaction,
			transfer,
			parse_serial_numbers(transfer.get("serial_number")),
			cancel=True,
		)
	delete_stock_entries(transaction)


def delete_stock_entries(transaction):
	frappe.db.delete(
		"Books Stock Ledger Entry",
		{"reference_type": transaction.doctype, "reference_name": transaction.name},
	)


def populate_stock_row(row):
	if not row.item:
		return
	item = frappe.db.get_value("Books Item", row.item, ["description", "rate", "unit"], as_dict=True)
	if not item:
		return
	for fieldname in ("description", "rate", "unit"):
		if not row.get(fieldname):
			row.set(fieldname, item.get(fieldname))
	if not row.transfer_unit:
		row.transfer_unit = row.unit
	row.amount = rounded(as_decimal(row.rate) * as_decimal(row.quantity))


def parse_serial_numbers(value):
	if not value:
		return []
	return [line.strip() for line in str(value).replace(",", "\n").splitlines() if line.strip()]


def _validate_transfer(transaction, transfer):
	if not transfer.get("item"):
		frappe.throw(_("Every stock row requires an item."))
	quantity = abs(as_decimal(transfer.get("quantity")))
	if quantity <= 0:
		frappe.throw(_("Stock quantity must be greater than zero."))
	if as_decimal(transfer.get("rate")) < 0:
		frappe.throw(_("Stock rate cannot be negative."))
	if not transfer.get("from_location") and not transfer.get("to_location"):
		frappe.throw(_("Set a source or destination location."))

	item = frappe.db.get_value(
		"Books Item",
		transfer["item"],
		["track_item", "has_batch", "has_serial_number"],
		as_dict=True,
	)
	if item.has_batch:
		_validate_batch(transfer)
	serial_numbers = parse_serial_numbers(transfer.get("serial_number"))
	if item.has_serial_number and len(serial_numbers) != int(quantity):
		frappe.throw(_("Serial-number count must equal stock quantity."))
	if transfer.get("from_location") and item.track_item:
		available = stock_quantity(transfer["item"], transfer["from_location"], transfer.get("batch"))
		if available < quantity:
			frappe.throw(
				_("Insufficient stock for {0} at {1}: {2} available, {3} required.").format(
					transfer["item"], transfer["from_location"], available, quantity
				)
			)
		for serial_number in serial_numbers:
			if (
				stock_quantity(
					transfer["item"], transfer["from_location"], transfer.get("batch"), serial_number
				)
				< 1
			):
				frappe.throw(_("Serial number {0} is not available at the source.").format(serial_number))


def _validate_batch(transfer):
	batch = transfer.get("batch")
	if not batch:
		frappe.throw(_("Item {0} requires a batch.").format(transfer["item"]))
	batch_item = frappe.db.get_value("Books Batch", batch, "item")
	if batch_item and batch_item != transfer["item"]:
		frappe.throw(_("Batch {0} belongs to another item.").format(batch))


def _create_location_entries(transaction, transfer, quantity, serial_number):
	if transfer.get("from_location"):
		_create_stock_entry(transaction, transfer, transfer["from_location"], -quantity, serial_number)
	if transfer.get("to_location"):
		_create_stock_entry(transaction, transfer, transfer["to_location"], quantity, serial_number)


def _create_stock_entry(transaction, transfer, location, quantity, serial_number):
	frappe.get_doc(
		{
			"doctype": "Books Stock Ledger Entry",
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
	).insert(ignore_permissions=True)


def _update_serial_statuses(transaction, transfer, serial_numbers, cancel):
	for serial_number in serial_numbers:
		if transfer.get("to_location") and not frappe.db.exists("Books Serial Number", serial_number):
			frappe.get_doc(
				{
					"doctype": "Books Serial Number",
					"name": serial_number,
					"item": transfer["item"],
					"status": "Active",
				}
			).insert(ignore_permissions=True)
		if not frappe.db.exists("Books Serial Number", serial_number):
			continue
		if cancel:
			status = "Active" if transfer.get("from_location") else "Inactive"
		elif transfer.get("from_location") and not transfer.get("to_location"):
			status = "Delivered" if transaction.doctype == "Books Shipment" else "Inactive"
		else:
			status = "Active"
		frappe.db.set_value("Books Serial Number", serial_number, "status", status)
