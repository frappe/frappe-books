"""Stock movement, shipment, and receipt document controllers."""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import now_datetime

from frappe_books.accounting.accounts import validate_item_usage, validate_party_role
from frappe_books.accounting.ledger import LedgerPosting, delete_entries, reverse_entries
from frappe_books.accounting.returns import validate_quantity_sign
from frappe_books.inventory.invoice_balance import (
	bill_unbilled_rows,
	update_invoice_balance,
	validate_billable,
	validate_invoice_balance,
)
from frappe_books.inventory.returns import validate_transfer_return
from frappe_books.inventory.stock import (
	cancel_stock_entries,
	create_stock_entries,
	delete_stock_entries,
	populate_stock_rows,
	reverse_transfers,
	validate_stock_available,
	validate_transfer_rows,
)
from frappe_books.inventory.valuation import outgoing_rates, transaction_stock_value
from frappe_books.series import SeriesNamingMixin

STOCK_POSTING_DOCTYPES = ("Books Shipment", "Books Purchase Receipt")

# Fields an invoice and its transfer do not share when one is mapped from the other.
UNSHARED_FIELDS = ["date", "number_series", "terms", "attachment", "is_returned", "return_against"]


class StockMovementController(SeriesNamingMixin, Document):
	def before_validate(self):
		self.amount = populate_stock_rows(self.items)

	def validate(self):
		transfers = movement_transfers(self)
		_validate_movement_locations(self, transfers)
		validate_transfer_rows(transfers)

	def before_submit(self):
		validate_stock_available(movement_transfers(self), self.date)

	def before_cancel(self):
		validate_stock_available(reverse_transfers(movement_transfers(self)), self.date)

	def on_submit(self):
		repost_stock_accounts(create_stock_entries(self, movement_transfers(self)))

	def on_cancel(self):
		repost_stock_accounts(cancel_stock_entries(self, movement_transfers(self)))

	def on_trash(self):
		repost_stock_accounts(delete_stock_entries(self))


class StockTransferController(SeriesNamingMixin, Document):
	transfer_type = "sales"

	def before_validate(self):
		self.calculate()

	def calculate(self):
		"""Fill row defaults and the grand total, without writing anything."""
		self.grand_total = populate_stock_rows(self.items)

	def validate(self):
		validate_party_role(self, self.transfer_type == "purchase")
		validate_item_usage(self, self.transfer_type == "purchase")
		for row in self.items:
			validate_quantity_sign(row, bool(self.return_against))
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

	def update_returned_status(self):
		"""Flag the original transfer as returned while a submitted return against it remains."""
		if not self.return_against:
			return
		is_returned = frappe.db.exists(self.doctype, {"return_against": self.return_against, "docstatus": 1})
		frappe.db.set_value(
			self.doctype, self.return_against, "is_returned", int(bool(is_returned)), update_modified=False
		)


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
				"field_no_map": UNSHARED_FIELDS,
			},
			_items_doctype(transfer_doctype): {"doctype": _items_doctype(invoice_doctype)},
		},
		postprocess=_bill_transfer,
	)


def _bill_transfer(transfer, invoice):
	validate_billable(transfer)
	bill_unbilled_rows(transfer, invoice)
	invoice.date = now_datetime()
	invoice.calculate()


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
		rates = outgoing_rates(transaction.doctype, transaction.return_against)
		for row in rows:
			row["rate"] = rates[row["item"], row["batch"] or ""]
	return rows


def post_stock_accounts(transaction):
	value = transaction_stock_value(transaction)
	if value == 0:
		return
	_validate_value_direction(transaction, value)
	settings = frappe.get_single("Books Inventory Settings")
	stock = settings.stock_in_hand
	counter = (
		settings.cost_of_goods_sold
		if transaction.transfer_type == "sales"
		else settings.stock_received_but_not_billed
	)
	if not stock or not counter:
		frappe.throw(_("Set all inventory ledger accounts in Books Inventory Settings."))
	debit, credit = (stock, counter) if value > 0 else (counter, stock)
	posting = LedgerPosting(transaction)
	posting.debit(debit, abs(value))
	posting.credit(credit, abs(value))
	posting.post()


def repost_stock_accounts(references):
	"""Post the stock accounts of transfers again after a restatement changed their stock value."""
	for doctype, name in sorted(references):
		if doctype in STOCK_POSTING_DOCTYPES:
			transfer = frappe.get_doc(doctype, name)
			delete_entries(transfer)
			post_stock_accounts(transfer)


def _validate_value_direction(transaction, value):
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
	if movement.movement_type == "MaterialIssue" and any(row["to_location"] for row in transfers):
		frappe.throw(_("Material issues cannot have a destination location."))
	if movement.movement_type == "MaterialReceipt" and any(row["from_location"] for row in transfers):
		frappe.throw(_("Material receipts cannot have a source location."))
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
