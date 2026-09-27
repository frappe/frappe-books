"""Stock movement, shipment, and receipt document controllers."""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import now_datetime

from frappe_books.accounting.ledger import LedgerPosting, delete_entries, reverse_entries
from frappe_books.inventory.invoice_balance import update_invoice_balance, validate_invoice_balance
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
from frappe_books.inventory.valuation import transaction_stock_value
from frappe_books.series import SeriesNamingMixin

# Transfer fields that an invoice made from the transfer must not copy.
UNBILLED_FIELDS = ["date", "number_series", "terms", "attachment", "is_returned", "return_against"]


class StockMovementController(SeriesNamingMixin, Document):
	def before_validate(self):
		self.amount = populate_stock_rows(self.items)

	def validate(self):
		transfers = movement_transfers(self)
		_validate_movement_locations(self, transfers)
		validate_transfer_rows(transfers)

	def before_submit(self):
		validate_stock_available(movement_transfers(self))

	def before_cancel(self):
		validate_stock_available(reverse_transfers(movement_transfers(self)))

	def on_submit(self):
		create_stock_entries(self, movement_transfers(self))

	def on_cancel(self):
		cancel_stock_entries(self, movement_transfers(self))

	def on_trash(self):
		delete_stock_entries(self)


class StockTransferController(SeriesNamingMixin, Document):
	transfer_type = "sales"

	def before_validate(self):
		self.calculate()

	def calculate(self):
		"""Fill row defaults and the grand total, without writing anything."""
		self.grand_total = populate_stock_rows(self.items)

	def validate(self):
		validate_transfer_rows(transfer_rows(self))
		if self.return_against:
			validate_transfer_return(self)

	def before_submit(self):
		validate_stock_available(transfer_rows(self))
		validate_invoice_balance(self)

	def before_cancel(self):
		validate_stock_available(reverse_transfers(transfer_rows(self)))

	def on_submit(self):
		create_stock_entries(self, transfer_rows(self))
		post_stock_accounts(self)
		update_invoice_balance(self)
		self.update_returned_status()

	def on_cancel(self):
		cancel_stock_entries(self, transfer_rows(self))
		reverse_entries(self)
		update_invoice_balance(self)
		self.update_returned_status()

	def on_trash(self):
		delete_stock_entries(self)
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
				"field_no_map": UNBILLED_FIELDS,
			},
			_items_doctype(transfer_doctype): {"doctype": _items_doctype(invoice_doctype)},
		},
		postprocess=_bill_transfer,
	)


def _bill_transfer(transfer, invoice):
	if transfer.back_reference:
		frappe.throw(_("{0} was made from invoice {1}.").format(transfer.name, transfer.back_reference))
	if transfer.return_against:
		frappe.throw(_("A return cannot be billed."))
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
				"at_valuation_rate": is_return and transaction.transfer_type == "sales",
			}
		)
	return rows


def post_stock_accounts(transaction):
	amount = transaction_stock_value(transaction)
	if amount == 0:
		return
	settings = frappe.get_single("Books Inventory Settings")
	posting = LedgerPosting(transaction)
	is_return = bool(transaction.return_against)
	if transaction.transfer_type == "sales":
		_debit_credit(
			posting,
			settings.cost_of_goods_sold,
			settings.stock_in_hand,
			amount,
			reverse=is_return,
		)
	else:
		_debit_credit(
			posting,
			settings.stock_in_hand,
			settings.stock_received_but_not_billed,
			amount,
			reverse=is_return,
		)
	posting.post()


def _debit_credit(posting, debit_account, credit_account, amount, reverse):
	if not debit_account or not credit_account:
		frappe.throw(_("Set all inventory ledger accounts in Books Inventory Settings."))
	if reverse:
		debit_account, credit_account = credit_account, debit_account
	posting.debit(debit_account, amount)
	posting.credit(credit_account, amount)


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
