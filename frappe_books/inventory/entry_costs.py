"""What a stock movement's rows cost: a manufacture's product takes the cost consumed, and rows show the cost moved."""

from collections import defaultdict

import frappe

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.inventory import valuation

DOCTYPE = "Books Stock Movement"


def total_amount(rows):
	"""What the movement brings into stock, or for an issue what it takes out."""
	counted = [row for row in rows if row.to_location] or rows
	return rounded(sum((as_decimal(row.amount) for row in counted), as_decimal(0)))


def rate_products(movement, produced):
	"""Rate a manufacture's produced rows at the cost its posted consumed rows took out."""
	rate = _product_rate(
		{row["item"] for row in produced},
		-valuation.transaction_stock_value(movement),
		sum(as_decimal(row["quantity"]) for row in produced),
	)
	if rate is not None:
		for row in produced:
			row["rate"] = rate


def revalue_manufactures(references):
	"""Bring in the products of restated manufactures at the cost their consumed stock now takes out."""
	names = [name for doctype, name in references if doctype == DOCTYPE]
	if not names:
		return set()
	manufactures = frappe.get_all(
		DOCTYPE, filters={"name": ["in", names], "movement_type": "Manufacture"}, pluck="name"
	)
	entries = valuation.transaction_entries(DOCTYPE, manufactures)
	by_manufacture = defaultdict(list)
	for entry in entries:
		by_manufacture[entry.reference_name].append(entry)
	rates = {}
	for manufacture_entries in by_manufacture.values():
		rates |= _product_entry_rates(manufacture_entries)
	return valuation.revalue_entries([entry for entry in entries if entry.name in rates], rates)


def store_costs(movement):
	"""Show on a submitted movement's rows the cost its stock ledger entries moved, where the ledger sets it."""
	rates = _ledger_rates(movement)
	rated_products = movement.movement_type == "Manufacture" and _one_item(
		row.item for row in movement.items if row.to_location
	)
	for row in movement.items:
		if row.from_location:
			key = (row.item, row.from_location, row.batch or "", False)
		elif rated_products:
			key = (row.item, row.to_location, row.batch or "", True)
		else:
			continue
		row.rate = rates[key]
		row.amount = rounded(rates[key] * as_decimal(row.quantity))
		row.db_update()
	movement.db_set("amount", total_amount(movement.items), update_modified=False)


def _product_entry_rates(entries):
	"""Map a manufacture's product entries to the rate its consumed entries took out."""
	produced = [entry for entry in entries if as_decimal(entry.quantity) > 0]
	consumed = [entry for entry in entries if as_decimal(entry.quantity) < 0]
	rate = _product_rate(
		{entry.item for entry in produced},
		-sum((as_decimal(entry.value_change) for entry in consumed), as_decimal(0)),
		sum((as_decimal(entry.quantity) for entry in produced), as_decimal(0)),
	)
	return {} if rate is None else {entry.name: rate for entry in produced}


def _product_rate(items, consumed_value, quantity):
	"""One produced item takes the consumed cost per unit, as ERPNext's repack; several keep their own rates."""
	return consumed_value / quantity if quantity and _one_item(items) else None


def _one_item(items):
	return len(set(items)) == 1


def _ledger_rates(movement):
	"""Map (item, location, batch, incoming) to the average rate the movement's stock ledger entries moved at."""
	values = defaultdict(as_decimal)
	quantities = defaultdict(as_decimal)
	for entry in valuation.transaction_entries(DOCTYPE, [movement.name]):
		quantity = as_decimal(entry.quantity)
		key = (entry.item, entry.location, entry.batch or "", quantity > 0)
		values[key] += as_decimal(entry.value_change)
		quantities[key] += quantity
	return {key: values[key] / quantities[key] for key in values}
