"""Stock movement, shipment, and receipt document controllers."""

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.accounting.accounts import validate_item_usage, validate_party_role
from frappe_books.accounting.returns import set_quantity_signs
from frappe_books.inventory import invoice_transfer, stock_posting
from frappe_books.inventory.returns import validate_transfer_return
from frappe_books.inventory.stock import (
	create_series_batches,
	create_series_serial_numbers,
	fill_serial_numbers,
	populate_stock_rows,
	reverse_transfers,
	start_row_quantities,
	validate_stock_available,
	validate_transfer_rows,
)
from frappe_books.permissions import check_preview_permission
from frappe_books.regional import validate_hsn_codes
from frappe_books.series import SeriesNamingMixin
from frappe_books.settings import require_feature, require_features, set_default_terms
from frappe_books.status import StatusMixin

# The row location an issue or receipt uses, the default location when empty, and the one it does not use.
MOVEMENT_LOCATION_FIELDS = {
	"MaterialIssue": ("from_location", "to_location"),
	"MaterialReceipt": ("to_location", "from_location"),
}


class StockTransactionController(StatusMixin, SeriesNamingMixin, Document):
	"""A document that moves stock: checks it is there on submit and cancel, and posts it."""

	def transfer_rows(self) -> list[dict]:
		"""Return each row as the item, quantity, rate, batch and serial numbers it moves between locations."""
		raise NotImplementedError

	def before_submit(self):
		validate_stock_available(self.transfer_rows(), self.date)

	def before_cancel(self):
		validate_stock_available(reverse_transfers(self.transfer_rows()), self.date)

	def on_submit(self):
		stock_posting.post(self)

	def on_cancel(self):
		stock_posting.cancel(self)

	def on_trash(self):
		stock_posting.delete(self)


class StockMovementController(StockTransactionController):
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
		transfers = self.transfer_rows()
		_validate_movement_locations(self, transfers)
		validate_transfer_rows(transfers)

	def transfer_rows(self):
		return [_transfer_row(row, row.from_location, row.to_location) for row in self.items]


class StockTransferController(StockTransactionController):
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
		validate_transfer_rows(self.transfer_rows())
		validate_hsn_codes(self.items)
		if self.return_against:
			validate_transfer_return(self)

	def before_submit(self):
		super().before_submit()
		invoice_transfer.validate_transfer(self)

	def on_submit(self):
		super().on_submit()
		invoice_transfer.update_invoice_balance(self)
		self.update_returned_status()

	def on_cancel(self):
		super().on_cancel()
		invoice_transfer.update_invoice_balance(self)
		self.update_returned_status()

	def transfer_rows(self):
		rows = []
		for row in self.items:
			if self.transfer_type == "sales":
				from_location, to_location = row.location, None
			else:
				from_location, to_location = None, row.location
			if self.return_against:
				from_location, to_location = to_location, from_location
			rows.append(_transfer_row(row, from_location, to_location))
		return rows

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


def _transfer_row(row, from_location, to_location):
	return {
		"item": row.item,
		"from_location": from_location,
		"to_location": to_location,
		"quantity": row.quantity,
		"rate": row.rate,
		"batch": row.batch,
		"serial_number": row.serial_number,
	}


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
