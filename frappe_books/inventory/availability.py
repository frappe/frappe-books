from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import flt, get_datetime

from frappe_books.accounting.money import as_decimal, plain_number
from frappe_books.inventory.auto_transfer import default_location

LEDGER = "Books Stock Ledger Entry"
INVOICE_DOCTYPES = ("Books Sales Invoice", "Books Purchase Invoice")


@frappe.whitelist()
def get_stock_location(doctype: str, is_pos: bool = False) -> str | None:
	"""Return where an invoice of the doctype moves its stock, as its stock transfer would."""
	# A quote ships like the sales invoice made from it.
	invoice_doctype = "Books Sales Invoice" if doctype == "Books Sales Quote" else doctype
	if invoice_doctype not in INVOICE_DOCTYPES:
		frappe.throw(_("Only invoices move stock from a default location."))
	frappe.has_permission(doctype, "read", throw=True)
	return default_location(frappe.new_doc(invoice_doctype, is_pos=is_pos))


def get_stock_quantities(
	location: str | None = None, items: list[str] | None = None, date: str | None = None
) -> list[dict]:
	"""Return the stock of each item and batch, at the location and up to the date when given."""
	filters = {}
	if location:
		filters["location"] = location
	if items:
		filters["item"] = ["in", items]
	if date:
		filters["date"] = ["<=", get_datetime(date)]
	return frappe.get_list(
		LEDGER,
		filters=filters,
		fields=["item", "batch", {"SUM": "quantity", "as": "quantity"}],
		group_by="item, batch",
		order_by="item, batch",
	)


@frappe.whitelist()
def get_sale_shortfalls(items: list[dict], date: str | None = None, is_pos: bool = False) -> list[dict]:
	"""Return how much of each tracked item, or of its batch, a sale lacks where it ships from, on the date when given."""
	required, available = _sale_stock(items, date, is_pos)
	return [
		{"item": item, "batch": batch or None, "quantity": quantity - available[item, batch]}
		for (item, batch), quantity in required.items()
		if quantity > available[item, batch]
	]


def validate_sale_batch_stock(invoice):
	"""Reject a sale's or quote's batch row that needs more than the batch has where the sale ships from.

	/books checks a row as its batch or quantity is edited, so only new and edited rows are checked.
	"""
	if invoice.transaction_type not in ("sales", "quote") or invoice.get("return_against"):
		return
	if not frappe.db.get_single_value("Books Inventory Settings", "enable_batches"):
		return
	rows = _edited_batch_rows(invoice)
	if not rows:
		return
	stock = _batch_stock(rows, default_location(invoice))
	for row in rows:
		available, required = stock.get((row.item, row.batch), 0), as_decimal(row.quantity)
		if required > available:
			frappe.throw(
				_("Batch {0} only has {1} quantity available but {2} is required").format(
					row.batch, plain_number(available), plain_number(required)
				)
			)


def _edited_batch_rows(invoice):
	"""Rows with a batch that are new, or whose batch or quantity changed since the last save."""
	previous = invoice.get_doc_before_save()
	saved = {row.name: (row.batch, flt(row.quantity)) for row in previous.items} if previous else {}
	return [
		row
		for row in invoice.items
		if row.item and row.batch and saved.get(row.name) != (row.batch, flt(row.quantity))
	]


def _batch_stock(rows, location):
	"""Stock of the rows' batches, at the location when given, read as the system: the rule binds every saver."""
	filters = {
		"item": ["in", sorted({row.item for row in rows})],
		"batch": ["in", sorted({row.batch for row in rows})],
	}
	if location:
		filters["location"] = location
	stock = frappe.get_all(
		LEDGER,
		filters=filters,
		fields=["item", "batch", {"SUM": "quantity", "as": "quantity"}],
		group_by="item, batch",
	)
	return {(row.item, row.batch): as_decimal(row.quantity) for row in stock}


def validate_pos_stock(rows):
	"""Reject a POS sale of a tracked item without a batch that the POS location has none of, as the POS does."""
	required, available = _sale_stock(rows, None, is_pos=True)
	for item, batch in required:
		if not batch and available[item, batch] <= 0:
			frappe.throw(_("Item {0} is out of stock (quantity is zero)").format(item))


def _sale_stock(rows, date, is_pos):
	"""Return what the rows need of each tracked item and batch, and the stock where the sale ships from."""
	required = _tracked_quantities(rows)
	if not required:
		return required, defaultdict(float)
	location = get_stock_location("Books Sales Invoice", is_pos)
	stock = get_stock_quantities(location, sorted({item for item, _batch in required}), date)
	return required, _available(stock)


def _tracked_quantities(rows):
	"""Sum the rows' quantities of stock-tracked items by item and batch."""
	names = sorted({row.get("item") for row in rows if row.get("item")})
	if not names:
		return {}
	tracked = set(
		frappe.get_list("Books Item", filters={"name": ["in", names], "track_item": 1}, pluck="name")
	)
	quantities = defaultdict(float)
	for row in rows:
		if row.get("item") in tracked:
			quantities[row.get("item"), row.get("batch") or ""] += flt(row.get("quantity"))
	return quantities


def _available(stock):
	"""Stock by item and batch; a row without a batch takes from all of the item's stock."""
	available = defaultdict(float)
	for row in stock:
		available[row.item, ""] += flt(row.quantity)
		if row.batch:
			available[row.item, row.batch] = flt(row.quantity)
	return available
