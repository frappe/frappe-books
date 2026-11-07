"""What a stock entry's rows cost: a repack's product takes the cost consumed, and rows show the cost moved."""

from collections import defaultdict

import frappe

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.inventory import valuation


def total_amount(rows):
	"""What the entry brings into stock, or for an issue what it takes out."""
	counted = [row for row in rows if row.t_warehouse] or rows
	return rounded(sum((as_decimal(row.amount) for row in counted), as_decimal(0)))


def rate_products(entry, produced):
	"""Rate a repack's produced rows at the cost its posted consumed rows took out."""
	rate = _product_rate(
		{row["item_code"] for row in produced},
		-valuation.transaction_stock_value(entry),
		sum(as_decimal(row["stock_qty"]) for row in produced),
	)
	if rate is not None:
		for row in produced:
			row["rate"] = rate


def revalue_repacks(references):
	"""Bring in the products of restated repacks at the cost their consumed stock now takes out."""
	names = [name for doctype, name in references if doctype == "Books Stock Entry"]
	if not names:
		return set()
	repacks = frappe.get_all(
		"Books Stock Entry", filters={"name": ["in", names], "purpose": "Repack"}, pluck="name"
	)
	entries = valuation.transaction_entries("Books Stock Entry", repacks)
	by_repack = defaultdict(list)
	for entry in entries:
		by_repack[entry.voucher_no].append(entry)
	rates = {}
	for repack_entries in by_repack.values():
		rates |= _product_entry_rates(repack_entries)
	return valuation.revalue_entries([entry for entry in entries if entry.name in rates], rates)


def store_costs(entry):
	"""Show on a submitted entry's rows the cost its stock ledger entries moved, where the ledger sets it."""
	rates = _ledger_rates(entry)
	rated_products = entry.purpose == "Repack" and _one_item(
		row.item_code for row in entry.items if row.t_warehouse
	)
	for row in entry.items:
		if row.s_warehouse:
			key = (row.item_code, row.s_warehouse, row.batch_no or "", False)
		elif rated_products:
			key = (row.item_code, row.t_warehouse, row.batch_no or "", True)
		else:
			continue
		row.basic_rate = rates[key]
		row.amount = rounded(rates[key] * as_decimal(row.transfer_qty))
		row.db_update()
	entry.db_set("total_amount", total_amount(entry.items), update_modified=False)


def _product_entry_rates(entries):
	"""Map a repack's product entries to the rate its consumed entries took out."""
	produced = [entry for entry in entries if as_decimal(entry.actual_qty) > 0]
	consumed = [entry for entry in entries if as_decimal(entry.actual_qty) < 0]
	rate = _product_rate(
		{entry.item_code for entry in produced},
		-sum((as_decimal(entry.stock_value_difference) for entry in consumed), as_decimal(0)),
		sum((as_decimal(entry.actual_qty) for entry in produced), as_decimal(0)),
	)
	return {} if rate is None else {entry.name: rate for entry in produced}


def _product_rate(items, consumed_value, quantity):
	"""One produced item takes the consumed cost per unit, as ERPNext repacks; several keep their own rates."""
	return consumed_value / quantity if quantity and _one_item(items) else None


def _one_item(items):
	return len(set(items)) == 1


def _ledger_rates(entry):
	"""Map (item, warehouse, batch, incoming) to the average rate the entry's stock ledger entries moved at."""
	values = defaultdict(as_decimal)
	quantities = defaultdict(as_decimal)
	for sle in valuation.transaction_entries(entry.doctype, [entry.name]):
		quantity = as_decimal(sle.actual_qty)
		key = (sle.item_code, sle.warehouse, sle.batch_no or "", quantity > 0)
		values[key] += as_decimal(sle.stock_value_difference)
		quantities[key] += quantity
	return {key: values[key] / quantities[key] for key in values}
