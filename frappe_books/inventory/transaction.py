"""Stock entry, delivery note, and purchase receipt document controllers."""

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.accounting.party import PartyDocumentMixin
from frappe_books.accounting.returns import set_quantity_signs
from frappe_books.company import company_value
from frappe_books.dates import posting_datetime
from frappe_books.frappe_books.doctype.books_item.books_item import company_item_defaults
from frappe_books.inventory import invoice_transfer, stock_posting
from frappe_books.inventory.returns import update_returned_percent, validate_transfer_return
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

# The row warehouse an issue or receipt uses, the default warehouse when empty, and the one it does not use.
PURPOSE_WAREHOUSE_FIELDS = {
	"Material Issue": ("s_warehouse", "t_warehouse"),
	"Material Receipt": ("t_warehouse", "s_warehouse"),
}


class StockTransactionController(SeriesNamingMixin, Document):
	"""A document that moves stock: checks it is there on submit and cancel, and posts it."""

	def transfer_rows(self) -> list[dict]:
		"""Return each row as the item, stock quantity, rate per stock unit, batch and serial numbers it moves
		between warehouses."""
		raise NotImplementedError

	def posting_datetime(self):
		"""When the stock moves, which orders its stock ledger entries."""
		return posting_datetime(self.posting_date, self.posting_time)

	def before_submit(self):
		validate_stock_available(self.transfer_rows(), self.posting_datetime())

	def before_cancel(self):
		validate_stock_available(reverse_transfers(self.transfer_rows()), self.posting_datetime())

	def on_submit(self):
		stock_posting.post(self)

	def on_cancel(self):
		stock_posting.cancel(self)

	def on_trash(self):
		stock_posting.delete(self)


class StockEntryController(StockTransactionController):
	def before_validate(self):
		self.calculate()

	def calculate(self):
		"""Fill row warehouses, defaults and the total, without writing anything."""
		set_purpose_warehouses(self)
		start_row_quantities(self.items)
		self.total_amount = populate_stock_rows(self.items)

	@frappe.whitelist()
	def preview(self):
		"""Fill what a save would store, without saving, for the form to show it."""
		check_preview_permission(self)
		self.set_number_series()
		self.calculate()

	def validate(self):
		require_feature("enable_inventory")
		if self.purpose == "Material Receipt":
			create_series_batches(self.items)
			create_series_serial_numbers(self.items)
		transfers = self.transfer_rows()
		_validate_purpose_warehouses(self, transfers)
		validate_transfer_rows(transfers)

	def transfer_rows(self):
		return [
			_transfer_row(row, row.s_warehouse, row.t_warehouse, row.transfer_qty, row.basic_rate)
			for row in self.items
		]


class StockTransferController(StatusMixin, PartyDocumentMixin, StockTransactionController):
	transfer_type = "sales"

	def before_validate(self):
		set_default_terms(self)
		self.is_return = int(bool(self.return_against))
		self.calculate()

	def calculate(self):
		"""Fill row defaults and the grand total, without writing anything."""
		fill_default_warehouse(self.items, "warehouse")
		start_row_quantities(self.items)
		set_quantity_signs(self.items, bool(self.return_against))
		self.grand_total = populate_stock_rows(self.items)
		if self.transfer_type == "sales" and not self.return_against:
			fill_serial_numbers(self.items)

	def validate(self):
		require_feature("enable_inventory")
		require_features(self, {"return_against": "enable_invoice_returns"})
		if self.transfer_type == "purchase" and not self.return_against:
			create_series_batches(self.items)
			create_series_serial_numbers(self.items)
		validate_transfer_rows(self.transfer_rows())
		validate_hsn_codes(self.items, "gst_hsn_code")
		if self.return_against:
			validate_transfer_return(self)

	def before_submit(self):
		super().before_submit()
		invoice_transfer.validate_transfer(self)
		# Stock moved for an invoice is billed by it, as ERPNext bills a delivery note made from one.
		self.per_billed = 100 if invoice_transfer.source_invoice_name(self) else 0

	def on_submit(self):
		super().on_submit()
		invoice_transfer.update_invoice_balance(self)
		update_returned_percent(self)

	def on_cancel(self):
		super().on_cancel()
		invoice_transfer.update_invoice_balance(self)
		update_returned_percent(self)

	def transfer_rows(self):
		rows = []
		for row in self.items:
			if self.transfer_type == "sales":
				s_warehouse, t_warehouse = row.warehouse, None
			else:
				s_warehouse, t_warehouse = None, row.warehouse
			if self.return_against:
				s_warehouse, t_warehouse = t_warehouse, s_warehouse
			rows.append(_transfer_row(row, s_warehouse, t_warehouse, row.stock_qty, row.stock_uom_rate))
		return rows

	@frappe.whitelist()
	def preview(self):
		"""Fill what a save would store, without saving, for the form to show it."""
		check_preview_permission(self)
		self.set_number_series()
		self.before_validate()


def set_purpose_warehouses(entry):
	"""An issue has no target and a receipt no source; the one they use defaults."""
	used, unused = PURPOSE_WAREHOUSE_FIELDS.get(entry.purpose, (None, None))
	for row in entry.items:
		if unused:
			row.set(unused, None)
	fill_default_warehouse(entry.items, used)


def fill_default_warehouse(rows, fieldname):
	"""Set the item's default warehouse, else the company's, on rows that leave the field empty."""
	empty = [row for row in rows if fieldname and not row.get(fieldname)]
	if not empty:
		return
	warehouse = company_value("default_warehouse")
	defaults = company_item_defaults({row.item_code for row in empty if row.item_code})
	for row in empty:
		row.set(fieldname, defaults.get(row.item_code, {}).get("default_warehouse") or warehouse)


def _transfer_row(row, s_warehouse, t_warehouse, stock_qty, rate):
	return {
		"item_code": row.item_code,
		"s_warehouse": s_warehouse,
		"t_warehouse": t_warehouse,
		"stock_qty": stock_qty,
		"rate": rate,
		"batch_no": row.batch_no,
		"serial_no": row.serial_no,
	}


def _validate_purpose_warehouses(entry, transfers):
	if entry.purpose == "Repack":
		_validate_repack_warehouses(transfers)
	if entry.purpose == "Material Transfer" and any(
		not row["s_warehouse"] or not row["t_warehouse"] for row in transfers
	):
		frappe.throw(_("Material transfers require both source and target warehouses."))


def _validate_repack_warehouses(transfers):
	"""Each row either consumes (source only) or produces (target only)."""
	if any(row["s_warehouse"] and row["t_warehouse"] for row in transfers):
		frappe.throw(_("Each Repack row takes either a source or a target warehouse."))
	if not any(row["s_warehouse"] for row in transfers) or not any(row["t_warehouse"] for row in transfers):
		frappe.throw(_("Repack requires both consumed and produced items."))
