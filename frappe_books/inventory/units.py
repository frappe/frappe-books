from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import flt

from frappe_books.accounting.money import as_decimal


def stock_qty_field(row) -> str:
	"""The fieldname of a row's quantity in the stock unit: ERPNext's Stock Entry Detail names it `transfer_qty`."""
	return "transfer_qty" if row.get("doctype") == "Books Stock Entry Detail" else "stock_qty"


def populate_units(rows):
	"""Set each row's stock unit, unit and conversion factor from its item, and its stock quantity.

	A row keeps its quantity in its unit, as ERPNext does, and derives its stock quantity from it;
	a row with only a stock quantity derives its quantity. Quantities in a whole-number unit must be whole.
	"""
	items = item_units({row.item_code for row in rows} - {None, ""})
	for row in rows:
		if row.item_code in items:
			_populate_row_units(row, *items[row.item_code])
	validate_whole_quantities(rows)


def validate_whole_quantities(rows):
	units = {unit for row in rows for unit in (row.stock_uom, row.uom) if unit}
	whole_units = _whole_units(units)
	for row in rows:
		for fieldname, unit in ((stock_qty_field(row), row.stock_uom), ("qty", row.uom)):
			if unit in whole_units and not flt(row.get(fieldname)).is_integer():
				frappe.throw(
					_("{0} of {1} must be a whole number of {2}.").format(
						_(row.meta.get_label(fieldname)), row.item_code, unit
					)
				)


def _populate_row_units(row, unit, factors):
	row.stock_uom = unit
	row.uom = row.uom or unit
	row.conversion_factor = _conversion_factor(row, factors)
	stock_qty_fieldname = stock_qty_field(row)
	stock_qty = row.get(stock_qty_fieldname)
	if stock_qty and not row.qty:
		row.qty = as_decimal(stock_qty) / row.conversion_factor
	else:
		row.set(
			stock_qty_fieldname,
			flt(as_decimal(row.qty) * row.conversion_factor, row.precision(stock_qty_fieldname)),
		)


def _conversion_factor(row, factors):
	if row.uom == row.stock_uom:
		return 1
	if row.uom not in factors:
		frappe.throw(_("Transfer Unit {0} is not applicable for Item {1}").format(row.uom, row.item_code))
	return as_decimal(factors[row.uom])


def item_units(names):
	"""Map each item to its stock unit and the conversion factors of its other units."""
	if not names:
		return {}
	factors = defaultdict(dict)
	for row in frappe.get_all(
		"Books UOM Conversion Detail",
		filters={"parenttype": "Books Item", "parent": ["in", sorted(names)]},
		fields=["parent", "uom", "conversion_factor"],
	):
		factors[row.parent][row.uom] = row.conversion_factor
	items = frappe.get_all(
		"Books Item", filters={"name": ["in", sorted(names)]}, fields=["name", "stock_uom"]
	)
	return {item.name: (item.stock_uom, factors[item.name]) for item in items}


def _whole_units(units):
	if not units:
		return set()
	return set(
		frappe.get_all(
			"Books UOM", filters={"name": ["in", sorted(units)], "must_be_whole_number": 1}, pluck="name"
		)
	)
