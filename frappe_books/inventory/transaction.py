"""Stock movement, shipment, and receipt document controllers."""

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.accounting.ledger import LedgerPosting, delete_entries, reverse_entries
from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.inventory.stock import (
	cancel_stock_entries,
	create_stock_entries,
	delete_stock_entries,
	populate_stock_row,
	validate_transfer_rows,
)
from frappe_books.inventory.valuation import transaction_stock_value
from frappe_books.series import SeriesNamingMixin


class StockMovementController(SeriesNamingMixin, Document):
	def before_validate(self):
		for row in self.items:
			populate_stock_row(row)
		self.amount = rounded(sum((as_decimal(row.amount) for row in self.items), as_decimal(0)))

	def validate(self):
		transfers = movement_transfers(self)
		_validate_movement_locations(self, transfers)
		validate_transfer_rows(self, transfers)

	def on_submit(self):
		create_stock_entries(self, movement_transfers(self))

	def on_cancel(self):
		cancel_stock_entries(self, movement_transfers(self))

	def on_trash(self):
		delete_stock_entries(self)


class StockTransferController(SeriesNamingMixin, Document):
	transfer_type = "sales"

	def before_validate(self):
		for row in self.items:
			populate_stock_row(row)
		self.grand_total = rounded(sum((as_decimal(row.amount) for row in self.items), as_decimal(0)))

	def validate(self):
		validate_transfer_rows(self, transfer_rows(self))

	def on_submit(self):
		transfers = transfer_rows(self)
		create_stock_entries(self, transfers)
		post_stock_accounts(self)

	def on_cancel(self):
		cancel_stock_entries(self, transfer_rows(self))
		reverse_entries(self)

	def on_trash(self):
		delete_stock_entries(self)
		delete_entries(self)


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
	if movement.movement_type == "MaterialIssue" and any(row["to_location"] for row in transfers):
		frappe.throw(_("Material issues cannot have a destination location."))
	if movement.movement_type == "MaterialReceipt" and any(row["from_location"] for row in transfers):
		frappe.throw(_("Material receipts cannot have a source location."))
	if movement.movement_type == "MaterialTransfer" and any(
		not row["from_location"] or not row["to_location"] for row in transfers
	):
		frappe.throw(_("Material transfers require both source and destination locations."))
	if movement.movement_type == "Manufacture":
		if not any(row["from_location"] for row in transfers) or not any(
			row["to_location"] for row in transfers
		):
			frappe.throw(_("Manufacture requires both consumed and produced items."))
