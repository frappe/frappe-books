"""Stock movement, shipment, and receipt document controllers."""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc

from frappe_books.accounting.accounts import validate_item_usage, validate_party_role
from frappe_books.accounting.ledger import LedgerPosting, delete_entries, reverse_entries
from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.accounting.returns import set_quantity_signs
from frappe_books.inventory.invoice_balance import (
	bill_unbilled_rows,
	update_invoice_balance,
	validate_billable,
	validate_invoice_balance,
)
from frappe_books.inventory.returns import validate_transfer_return
from frappe_books.inventory.stock import (
	cancel_stock_entries,
	create_series_batches,
	create_series_serial_numbers,
	create_stock_entries,
	delete_stock_entries,
	fill_serial_numbers,
	populate_stock_rows,
	reverse_transfers,
	start_row_quantities,
	validate_stock_available,
	validate_transfer_rows,
)
from frappe_books.inventory.valuation import (
	outgoing_rates,
	revalue_entries,
	transaction_entries,
	transaction_stock_value,
)
from frappe_books.permissions import check_preview_permission
from frappe_books.series import SeriesNamingMixin
from frappe_books.settings import require_feature, require_features, set_default_terms
from frappe_books.status import StatusMixin

# The Books Inventory Settings account each stock document moves its stock value against.
STOCK_COUNTER_ACCOUNTS = {
	"Books Shipment": "cost_of_goods_sold",
	"Books Purchase Receipt": "stock_received_but_not_billed",
	"Books Stock Movement": "stock_adjustment",
}

# The row location an issue or receipt uses, the default location when empty, and the one it does not use.
MOVEMENT_LOCATION_FIELDS = {
	"MaterialIssue": ("from_location", "to_location"),
	"MaterialReceipt": ("to_location", "from_location"),
}

# Fields an invoice and its transfer do not share when one is mapped from the other.
UNSHARED_FIELDS = ["date", "number_series", "terms", "attachment", "is_returned", "return_against"]


class StockMovementController(StatusMixin, SeriesNamingMixin, Document):
	def before_validate(self):
		self.calculate()

	def calculate(self):
		"""Fill row locations, defaults and the total, without writing anything."""
		set_movement_locations(self)
		start_row_quantities(self.items)
		self.amount = populate_stock_rows(self.items)

	@frappe.whitelist()
	def preview(self):
		"""Fill what a save would store, without saving, for the form to show it."""
		check_preview_permission(self)
		self.set_number_series()
		self.calculate()

	def validate(self):
		require_feature("enable_inventory")
		if self.movement_type == "MaterialReceipt":
			create_series_batches(self.items)
			create_series_serial_numbers(self.items)
		transfers = movement_transfers(self)
		_validate_movement_locations(self, transfers)
		validate_transfer_rows(transfers)

	def before_submit(self):
		validate_stock_available(movement_transfers(self), self.date)

	def before_cancel(self):
		validate_stock_available(reverse_transfers(movement_transfers(self)), self.date)

	def on_submit(self):
		restated = create_stock_entries(self, movement_transfers(self))
		post_stock_accounts(self)
		repost_stock_accounts(restated)

	def on_cancel(self):
		restated = cancel_stock_entries(self, movement_transfers(self))
		reverse_entries(self)
		repost_stock_accounts(restated)

	def on_trash(self):
		repost_stock_accounts(delete_stock_entries(self))
		delete_entries(self)


class StockTransferController(StatusMixin, SeriesNamingMixin, Document):
	transfer_type = "sales"

	def before_validate(self):
		set_default_terms(self)
		self.calculate()

	def calculate(self):
		"""Fill row defaults and the grand total, without writing anything."""
		fill_default_location(self.items, "location")
		start_row_quantities(self.items)
		set_quantity_signs(self.items, bool(self.return_against))
		self.grand_total = populate_stock_rows(self.items)
		if self.transfer_type == "sales" and not self.return_against:
			fill_serial_numbers(self.items)

	def validate(self):
		require_feature("enable_inventory")
		require_features(self, {"return_against": "enable_invoice_returns"})
		validate_party_role(self, self.transfer_type == "purchase")
		validate_item_usage(self, self.transfer_type == "purchase")
		if self.transfer_type == "purchase" and not self.return_against:
			create_series_batches(self.items)
			create_series_serial_numbers(self.items)
		validate_transfer_rows(transfer_rows(self))
		if self.return_against:
			validate_transfer_return(self)

	def before_submit(self):
		validate_stock_available(transfer_rows(self), self.date)
		validate_invoice_balance(self)

	def before_cancel(self):
		validate_stock_available(reverse_transfers(transfer_rows(self)), self.date)

	def on_submit(self):
		restated = create_stock_entries(self, valued_transfer_rows(self))
		post_stock_accounts(self)
		repost_stock_accounts(restated)
		update_invoice_balance(self)
		self.update_returned_status()

	def on_cancel(self):
		restated = cancel_stock_entries(self, transfer_rows(self))
		reverse_entries(self)
		repost_stock_accounts(restated)
		update_invoice_balance(self)
		self.update_returned_status()

	def on_trash(self):
		repost_stock_accounts(delete_stock_entries(self))
		delete_entries(self)

	@frappe.whitelist()
	def preview(self):
		"""Fill what a save would store, without saving, for the form to show it."""
		check_preview_permission(self)
		self.set_number_series()
		self.before_validate()

	def update_returned_status(self):
		"""Flag the original transfer as returned while a submitted return against it remains."""
		if not self.return_against:
			return
		is_returned = frappe.db.exists(self.doctype, {"return_against": self.return_against, "docstatus": 1})
		frappe.db.set_value(
			self.doctype, self.return_against, "is_returned", int(bool(is_returned)), update_modified=False
		)


def set_movement_locations(movement):
	"""An issue has no destination and a receipt no source; the one they use defaults."""
	used, unused = MOVEMENT_LOCATION_FIELDS.get(movement.movement_type, (None, None))
	for row in movement.items:
		if unused:
			row.set(unused, None)
	fill_default_location(movement.items, used)


def fill_default_location(rows, fieldname):
	"""Set the Inventory Settings default location on rows that leave the field empty."""
	location = fieldname and frappe.db.get_single_value("Books Inventory Settings", "default_location")
	for row in rows:
		if location and not row.get(fieldname):
			row.set(fieldname, location)


def map_transfer_invoice(transfer_doctype, transfer_name):
	"""Return an unsaved invoice that bills a submitted shipment or purchase receipt."""
	invoice_doctype = frappe.get_meta(transfer_doctype).get_field("back_reference").options
	return get_mapped_doc(
		transfer_doctype,
		transfer_name,
		{
			transfer_doctype: {
				"doctype": invoice_doctype,
				"validation": {"docstatus": ["=", 1]},
				"field_map": {"name": "back_reference"},
				"field_no_map": UNSHARED_FIELDS,
			},
			_items_doctype(transfer_doctype): {"doctype": _items_doctype(invoice_doctype)},
		},
		postprocess=_bill_transfer,
	)


def _bill_transfer(transfer, invoice):
	validate_billable(transfer)
	bill_unbilled_rows(transfer, invoice)
	invoice.fill_mapped_values()


def _items_doctype(doctype):
	return frappe.get_meta(doctype).get_field("items").options


def movement_transfers(movement):
	return [
		{
			"item": row.item,
			"from_location": row.from_location,
			"to_location": row.to_location,
			"quantity": row.quantity,
			"rate": row.rate,
			"batch": row.batch,
			"serial_number": row.serial_number,
		}
		for row in movement.items
	]


def transfer_rows(transaction):
	rows = []
	for row in transaction.items:
		location = row.location
		is_return = bool(transaction.return_against)
		from_location = location if transaction.transfer_type == "sales" else None
		to_location = location if transaction.transfer_type == "purchase" else None
		if is_return:
			from_location, to_location = to_location, from_location
		rows.append(
			{
				"item": row.item,
				"from_location": from_location,
				"to_location": to_location,
				"quantity": row.quantity,
				"rate": row.rate,
				"batch": row.batch,
				"serial_number": row.serial_number,
			}
		)
	return rows


def valued_transfer_rows(transaction):
	"""Return the transfer rows, with a sales return valued at the cost its shipment took out."""
	rows = transfer_rows(transaction)
	if transaction.transfer_type == "sales" and transaction.return_against:
		rates = outgoing_rates(transaction.doctype, [transaction.return_against])
		for row in rows:
			row["rate"] = rates[transaction.return_against, row["item"], row["batch"] or ""]
	return rows


def post_stock_accounts(transaction):
	value = transaction_stock_value(transaction)
	if value == 0:
		return
	_validate_value_direction(transaction, value)
	settings = frappe.get_single("Books Inventory Settings")
	stock = settings.stock_in_hand
	counter = settings.get(STOCK_COUNTER_ACCOUNTS[transaction.doctype])
	if not stock or not counter:
		frappe.throw(_("Set all inventory ledger accounts in Books Inventory Settings."))
	debit, credit = (stock, counter) if value > 0 else (counter, stock)
	posting = LedgerPosting(transaction)
	posting.debit(debit, abs(value))
	posting.credit(credit, abs(value))
	posting.post()


def repost_stock_accounts(references):
	"""Revalue the stock valued from restated transfers, then post their stock accounts again."""
	for doctype, name in sorted(revalue_dependents(references)):
		if doctype in STOCK_COUNTER_ACCOUNTS:
			transfer = frappe.get_doc(doctype, name)
			delete_entries(transfer)
			post_stock_accounts(transfer)


def revalue_dependents(references):
	"""Pass restated costs on to the stock that material transfers and sales returns took in at them.

	Return every transaction whose stock value changed.
	"""
	restated = set(references)
	pending = set(references)
	while pending:
		pending = _revalue_transfers(pending) | _revalue_returns(pending)
		restated |= pending
	return restated


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
	entries = transaction_entries("Books Stock Movement", transfers)
	rates = {}
	for entry in entries:
		# Each incoming entry follows the outgoing entry it takes its cost from.
		if as_decimal(entry.quantity) < 0:
			rate = as_decimal(entry.value_change) / as_decimal(entry.quantity)
		else:
			rates[entry.name] = rate
	return revalue_entries([entry for entry in entries if entry.name in rates], rates)


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
	costs = outgoing_rates("Books Shipment", list(set(returns.values())))
	entries = transaction_entries("Books Shipment", list(returns))
	rates = {
		entry.name: rounded(costs[returns[entry.reference_name], entry.item, entry.batch or ""])
		for entry in entries
	}
	return revalue_entries(entries, rates)


def _validate_value_direction(transaction, value):
	if transaction.doctype == "Books Stock Movement":
		# A manufacture can add or remove value; an issue or a receipt moves it one way only.
		return
	takes_stock_out = (transaction.transfer_type == "sales") != bool(transaction.return_against)
	if (value < 0) != takes_stock_out:
		frappe.throw(
			_("{0} would move stock value the wrong way by {1}. Check its items for negative stock.").format(
				transaction.name, value
			)
		)


def _validate_movement_locations(movement, transfers):
	if movement.movement_type == "Manufacture":
		_validate_manufacture_locations(transfers)
	if movement.movement_type == "MaterialTransfer" and any(
		not row["from_location"] or not row["to_location"] for row in transfers
	):
		frappe.throw(_("Material transfers require both source and destination locations."))


def _validate_manufacture_locations(transfers):
	"""Each row either consumes (source only) or produces (destination only)."""
	if any(row["from_location"] and row["to_location"] for row in transfers):
		frappe.throw(_("Only From or To can be set for Manufacture"))
	if not any(row["from_location"] for row in transfers) or not any(row["to_location"] for row in transfers):
		frappe.throw(_("Manufacture requires both consumed and produced items."))
