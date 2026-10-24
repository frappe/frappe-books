from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import flt

from frappe_books.accounting.money import as_decimal
from frappe_books.inventory.row_fields import INVOICE_ROW, row_fields, row_values


def populate_units(rows):
	"""Set each row's stock unit, unit and conversion factor from its item, and its quantities.

	A missing quantity is derived from the other. When both are set, a quote or invoice row keeps
	its quantity in its unit, as ERPNext does. A stock row in the stock unit keeps its stock
	quantity and a stock row in another unit converts its quantity in that unit.
	Quantities in a whole-number unit must be whole.
	"""
	items = item_units({row_values(row, "item")[0] for row in rows} - {None, ""})
	for row in rows:
		item = row_values(row, "item")[0]
		if item in items:
			_populate_row_units(row, row_fields(row), *items[item])
	validate_whole_quantities(rows)


def validate_whole_quantities(rows):
	units = {unit for row in rows for unit in row_values(row, "stock_uom", "uom") if unit}
	whole_units = _whole_units(units)
	for row in rows:
		fields = row_fields(row)
		for quantity_field, unit_field in (("stock_qty", "stock_uom"), ("qty", "uom")):
			fieldname, unit = fields[quantity_field], row.get(fields[unit_field])
			if unit in whole_units and not flt(row.get(fieldname)).is_integer():
				frappe.throw(
					_("{0} of {1} must be a whole number of {2}.").format(
						_(row.meta.get_label(fieldname)), row.get(fields.item), unit
					)
				)


def _populate_row_units(row, fields, unit, factors):
	row.set(fields.stock_uom, unit)
	row.set(fields.uom, row.get(fields.uom) or unit)
	factor = _conversion_factor(row, fields, factors)
	row.set(fields.factor, factor)
	qty, stock_qty = row.get(fields.qty), row.get(fields.stock_qty)
	if _keeps_stock_qty(fields, row, qty, stock_qty):
		row.set(fields.qty, as_decimal(stock_qty) / factor)
	else:
		row.set(fields.stock_qty, flt(as_decimal(qty) * factor, row.precision(fields.stock_qty)))


def _keeps_stock_qty(fields, row, qty, stock_qty):
	if not stock_qty:
		return False
	if fields is INVOICE_ROW:
		return not qty
	return row.get(fields.uom) == row.get(fields.stock_uom) or not qty


def _conversion_factor(row, fields, factors):
	uom = row.get(fields.uom)
	if uom == row.get(fields.stock_uom):
		return 1
	if uom not in factors:
		frappe.throw(_("Transfer Unit {0} is not applicable for Item {1}").format(uom, row.get(fields.item)))
	return as_decimal(factors[uom])


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
