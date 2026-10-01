"""Aggregate queries used by the Books web interface."""

from typing import Any, Literal

import frappe

from frappe_books.inventory.auto_transfer import default_location
from frappe_books.series import default_series_by_schema
from frappe_books.ui_bridge.database import system_datetime
from frappe_books.ui_bridge.dispatch import call_handler
from frappe_books.ui_bridge.mapping import target_doctype


class BooksBespokeQueries:
	def call(self, method: str, args: list[Any]) -> Any:
		handler = getattr(self, _METHODS.get(method, ""), None)
		if not handler:
			frappe.throw(f"Unsupported Books query: {method}")
		return call_handler(handler, method, args)

	def stock_quantity(
		self,
		item: str,
		location: str | None = None,
		from_date: str | None = None,
		to_date: str | None = None,
		batch: str | None = None,
		serial_numbers: list[str] | None = None,
	):
		filters: dict[str, Any] = {"item": item}
		if location:
			filters["location"] = location
		if batch:
			filters["batch"] = batch
		if serial_numbers:
			filters["serial_number"] = ["in", serial_numbers]
		if from_date and to_date:
			filters["date"] = ["between", [system_datetime(from_date), system_datetime(to_date)]]
		elif from_date:
			filters["date"] = [">=", system_datetime(from_date)]
		elif to_date:
			filters["date"] = ["<=", system_datetime(to_date)]
		quantity = frappe.get_list(
			"Books Stock Ledger Entry", filters=filters, fields=[{"SUM": "quantity", "as": "quantity"}]
		)[0].quantity
		return None if quantity is None else float(quantity)

	def stock_quantities(self, location: str | None = None, items: list[str] | None = None):
		"""Return the stock quantity of each item and batch."""
		filters: dict[str, Any] = {}
		if location:
			filters["location"] = location
		if items:
			filters["item"] = ["in", items]
		return frappe.get_list(
			"Books Stock Ledger Entry",
			filters=filters,
			fields=["item", "batch", {"SUM": "quantity", "as": "quantity"}],
			group_by="item, batch",
			order_by="item, batch",
		)

	def stock_location(self, source_schema: Literal["SalesInvoice", "PurchaseInvoice"], is_pos: bool = False):
		"""Return the location an invoice's stock transfer uses, as the server picks it."""
		invoice = frappe.new_doc(target_doctype(source_schema), is_pos=is_pos)
		frappe.has_permission(invoice.doctype, "read", throw=True)
		return default_location(invoice)

	def default_number_series(self):
		frappe.has_permission("Books Defaults", "read", throw=True)
		return default_series_by_schema()


_METHODS = {
	"getStockQuantity": "stock_quantity",
	"getStockQuantities": "stock_quantities",
	"getStockLocation": "stock_location",
	"getDefaultNumberSeries": "default_number_series",
}
