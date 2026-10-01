from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import flt, get_datetime

from frappe_books.inventory.auto_transfer import default_location

LEDGER = "Books Stock Ledger Entry"
INVOICE_DOCTYPES = ("Books Sales Invoice", "Books Purchase Invoice")


@frappe.whitelist()
def get_stock_location(doctype: str, is_pos: bool = False) -> str | None:
	"""Return where an invoice of the doctype moves its stock, as its stock transfer would."""
	if doctype not in INVOICE_DOCTYPES:
		frappe.throw(_("Only invoices move stock from a default location."))
	invoice = frappe.new_doc(doctype, is_pos=is_pos)
	frappe.has_permission(doctype, "read", throw=True)
	return default_location(invoice)


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
	required = _tracked_quantities(items)
	if not required:
		return []
	location = get_stock_location("Books Sales Invoice", is_pos)
	stock = get_stock_quantities(location, sorted({item for item, _batch in required}), date)
	available = _available(stock)
	return [
		{"item": item, "batch": batch or None, "quantity": quantity - available[item, batch]}
		for (item, batch), quantity in required.items()
		if quantity > available[item, batch]
	]


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
			quantities[row["item"], row.get("batch") or ""] += flt(row.get("quantity"))
	return quantities


def _available(stock):
	"""Stock by item and batch; a row without a batch takes from all of the item's stock."""
	available = defaultdict(float)
	for row in stock:
		available[row.item, ""] += flt(row.quantity)
		if row.batch:
			available[row.item, row.batch] = flt(row.quantity)
	return available
