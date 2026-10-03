from decimal import Decimal

import frappe
from frappe import _

from frappe_books.accounting import ledger
from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.inventory import valuation
from frappe_books.inventory.stock import parse_serial_numbers

# The Books Inventory Settings account each stock document moves its stock value against.
STOCK_COUNTER_ACCOUNTS = {
	"Books Shipment": "cost_of_goods_sold",
	"Books Purchase Receipt": "stock_received_but_not_billed",
	"Books Stock Movement": "stock_adjustment",
}


def post(transaction):
	"""Add a submitted transaction's stock ledger entries and post their value, then repost what they restated."""
	restated = _create_entries(transaction, _valued_rows(transaction))
	_post_stock_value(transaction)
	_repost(restated)


def cancel(transaction):
	"""Remove a cancelled transaction's stock ledger entries and reverse their posting, then repost what they restated."""
	for row in transaction.transfer_rows():
		_update_serial_statuses(transaction, row, cancel=True)
	restated = valuation.delete_entries(transaction.doctype, transaction.name)
	ledger.reverse_entries(transaction)
	_repost(restated)


def delete(transaction):
	"""Delete a transaction's stock ledger and ledger entries, then repost what they restated."""
	_repost(valuation.delete_entries(transaction.doctype, transaction.name))
	ledger.delete_entries(transaction)


def _valued_rows(transaction):
	"""Return the transaction's rows, with a sales return valued at the cost its shipment took out."""
	rows = transaction.transfer_rows()
	if transaction.doctype == "Books Shipment" and transaction.return_against:
		rates = valuation.outgoing_rates(transaction.doctype, [transaction.return_against])
		for row in rows:
			row["rate"] = rates[transaction.return_against, row["item"], row["batch"] or ""]
	return rows


def _create_entries(transaction, rows):
	"""Insert the rows' stock ledger entries and return the other transactions they restated."""
	restated = set()
	for row in rows:
		serial_numbers = _update_serial_statuses(transaction, row, cancel=False)
		if serial_numbers:
			for serial_number in serial_numbers:
				restated |= _create_location_entries(transaction, row, Decimal(1), serial_number)
		else:
			quantity = abs(as_decimal(row["quantity"]))
			restated |= _create_location_entries(transaction, row, quantity, None)
	restated.discard((transaction.doctype, transaction.name))
	return restated


def _create_location_entries(transaction, row, quantity, serial_number):
	restated = set()
	rate = rounded(row["rate"])
	if row.get("from_location"):
		entry, taken = _create_entry(transaction, row, row["from_location"], -quantity, serial_number, rate)
		restated |= taken
		# Stock moved between locations keeps the cost it left with.
		rate = -as_decimal(entry.value_change) / quantity
	if row.get("to_location"):
		_entry, added = _create_entry(transaction, row, row["to_location"], quantity, serial_number, rate)
		restated |= added
	return restated


def _create_entry(transaction, row, location, quantity, serial_number, rate):
	return valuation.insert_entry(
		{
			"date": transaction.date,
			"location": location,
			"batch": row.get("batch"),
			"serial_number": serial_number,
			"item": row["item"],
			"rate": rate,
			"quantity": quantity,
			"reference_type": transaction.doctype,
			"reference_name": transaction.name,
		}
	)


def _update_serial_statuses(transaction, row, cancel):
	"""Create arriving serial numbers and set the status the row leaves them in; return them."""
	serial_numbers = parse_serial_numbers(row.get("serial_number"))
	if not serial_numbers:
		return serial_numbers
	if row.get("to_location") and not cancel:
		_create_serial_numbers(row["item"], serial_numbers)
	frappe.db.set_value(
		"Books Serial Number",
		{"name": ["in", serial_numbers]},
		"status",
		_serial_status(transaction, row, cancel),
	)
	return serial_numbers


def _create_serial_numbers(item, serial_numbers):
	existing = set(
		frappe.get_all("Books Serial Number", filters={"name": ["in", serial_numbers]}, pluck="name")
	)
	for serial_number in serial_numbers:
		if serial_number not in existing:
			frappe.get_doc(
				{"doctype": "Books Serial Number", "name": serial_number, "item": item, "status": "Active"}
			).insert(ignore_permissions=True)


def _serial_status(transaction, row, cancel):
	if cancel and row.get("from_location"):
		return "Active"
	# Stock leaves: shipped or issued, or taken back out by cancelling a return or receipt.
	if cancel or (row.get("from_location") and not row.get("to_location")):
		return "Delivered" if transaction.doctype == "Books Shipment" else "Inactive"
	return "Active"


def _post_stock_value(transaction):
	"""Post the value the transaction's stock ledger entries moved against its counter account."""
	value = valuation.transaction_stock_value(transaction)
	if value == 0:
		return
	_validate_value_direction(transaction, value)
	settings = frappe.get_single("Books Inventory Settings")
	stock = settings.stock_in_hand
	counter = settings.get(STOCK_COUNTER_ACCOUNTS[transaction.doctype])
	if not stock or not counter:
		frappe.throw(_("Set all inventory ledger accounts in Books Inventory Settings."))
	debit, credit = (stock, counter) if value > 0 else (counter, stock)
	posting = ledger.LedgerPosting(transaction)
	posting.debit(debit, abs(value))
	posting.credit(credit, abs(value))
	posting.post()


def _validate_value_direction(transaction, value):
	if transaction.doctype == "Books Stock Movement":
		# A manufacture can add or remove value; an issue or a receipt moves it one way only.
		return
	takes_stock_out = (transaction.doctype == "Books Shipment") != bool(transaction.return_against)
	if (value < 0) != takes_stock_out:
		frappe.throw(
			_("{0} would move stock value the wrong way by {1}. Check its items for negative stock.").format(
				transaction.name, value
			)
		)


def _repost(restated):
	"""Revalue the stock valued from restated transactions, then post the value of every changed one again."""
	for doctype, name in sorted(_revalue_dependents(restated)):
		if doctype in STOCK_COUNTER_ACCOUNTS:
			transaction = frappe.get_doc(doctype, name)
			ledger.delete_entries(transaction)
			_post_stock_value(transaction)


def _revalue_dependents(restated):
	"""Pass restated costs on to the stock that material transfers and sales returns took in at them.

	Return every transaction whose stock value changed.
	"""
	changed = set(restated)
	pending = set(restated)
	while pending:
		pending = _revalue_transfers(pending) | _revalue_returns(pending)
		changed |= pending
	return changed


def _revalue_transfers(references):
	"""Bring in the stock of restated material transfers at the cost it now leaves with."""
	names = [name for doctype, name in references if doctype == "Books Stock Movement"]
	if not names:
		return set()
	transfers = frappe.get_all(
		"Books Stock Movement",
		filters={"name": ["in", names], "movement_type": "MaterialTransfer"},
		pluck="name",
	)
	entries = valuation.transaction_entries("Books Stock Movement", transfers)
	rates = {}
	for entry in entries:
		# Each incoming entry follows the outgoing entry it takes its cost from.
		if as_decimal(entry.quantity) < 0:
			rate = as_decimal(entry.value_change) / as_decimal(entry.quantity)
		else:
			rates[entry.name] = rate
	return valuation.revalue_entries([entry for entry in entries if entry.name in rates], rates)


def _revalue_returns(references):
	"""Take back the stock of sales returns at the cost their restated shipments now take out."""
	shipments = [name for doctype, name in references if doctype == "Books Shipment"]
	if not shipments:
		return set()
	returns = dict(
		frappe.get_all(
			"Books Shipment",
			filters={"return_against": ["in", shipments], "docstatus": 1},
			fields=["name", "return_against"],
			as_list=True,
		)
	)
	costs = valuation.outgoing_rates("Books Shipment", list(set(returns.values())))
	entries = valuation.transaction_entries("Books Shipment", list(returns))
	rates = {
		entry.name: rounded(costs[returns[entry.reference_name], entry.item, entry.batch or ""])
		for entry in entries
	}
	return valuation.revalue_entries(entries, rates)
