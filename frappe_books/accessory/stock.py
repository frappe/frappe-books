"""Stock checks of ERPNext sales in accessory mode, on ERPNext's own stock balances."""

from collections import defaultdict

import frappe
from erpnext.stock.doctype.batch.batch import get_batch_qty
from erpnext.stock.utils import get_stock_balance
from frappe.utils import flt, get_datetime


def get_sale_shortfalls(
	items: list[dict], date: str | None = None, warehouse: str | None = None
) -> list[dict]:
	"""How much of each stock item, or of its batch, the rows lack at their warehouse, by the date when given.

	A row without a warehouse ships from `warehouse`; a row without a batch takes from all of the item's stock.
	"""
	at = get_datetime(date) if date else None
	return [
		{"item_code": item, "batch_no": batch or None, "warehouse": store, "stock_qty": quantity - available}
		for (item, store, batch), quantity in _required(items, warehouse).items()
		if quantity > (available := _available(item, store, batch, at))
	]


def _required(rows: list[dict], warehouse: str | None) -> dict:
	"""The rows' stock quantities of stock items, by item, warehouse and batch."""
	names = sorted({row.get("item_code") for row in rows if row.get("item_code")})
	tracked = set(frappe.get_list("Item", filters={"name": ["in", names], "is_stock_item": 1}, pluck="name"))
	required = defaultdict(float)
	for row in rows:
		store = row.get("warehouse") or warehouse
		if row.get("item_code") in tracked and store:
			required[row["item_code"], store, row.get("batch_no") or ""] += flt(row.get("stock_qty"))
	return required


def _available(item: str, warehouse: str, batch: str, at) -> float:
	"""ERPNext's stock of the item, or of its batch, at the warehouse, by the time when given."""
	if batch:
		return flt(get_batch_qty(batch, warehouse, item, posting_datetime=at))
	date, time = (at.date(), at.time()) if at else (None, None)
	return flt(get_stock_balance(item, warehouse, date, time))
