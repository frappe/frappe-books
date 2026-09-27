from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import flt

from frappe_books.accounting.money import as_decimal


def populate_units(rows):
	"""Set each row's stock unit and conversion factor from its item, and its quantity in stock units.

	A row in the stock unit keeps its quantity. A row in another unit converts its transfer quantity.
	Quantities in a whole-number unit must be whole.
	"""
	items = _item_units({row.item for row in rows if row.item})
	for row in rows:
		if row.item in items:
			_populate_row_units(row, *items[row.item])
	validate_whole_quantities(rows)


def validate_whole_quantities(rows):
	whole_units = _whole_units({unit for row in rows for unit in (row.unit, row.transfer_unit) if unit})
	for row in rows:
		for fieldname, unit in (("quantity", row.unit), ("transfer_quantity", row.transfer_unit)):
			if unit in whole_units and not flt(row.get(fieldname)).is_integer():
				frappe.throw(
					_("{0} of {1} must be a whole number of {2}.").format(
						_(row.meta.get_label(fieldname)), row.item, unit
					)
				)


def _populate_row_units(row, unit, factors):
	row.unit = unit
	row.transfer_unit = row.transfer_unit or unit
	if row.transfer_unit == unit:
		row.unit_conversion_factor = 1
		row.transfer_quantity = row.quantity
		return
	if row.transfer_unit not in factors:
		frappe.throw(
			_("Transfer unit {0} is not applicable for item {1}.").format(row.transfer_unit, row.item)
		)
	factor = as_decimal(factors[row.transfer_unit])
	row.unit_conversion_factor = factor
	if not row.transfer_quantity:
		row.transfer_quantity = as_decimal(row.quantity) / factor
	row.quantity = flt(as_decimal(row.transfer_quantity) * factor, row.precision("quantity"))


def _item_units(names):
	"""Map each item to its stock unit and the conversion factors of its other units."""
	if not names:
		return {}
	factors = defaultdict(dict)
	for row in frappe.get_all(
		"Books Uom Conversion Item",
		filters={"parenttype": "Books Item", "parent": ["in", sorted(names)]},
		fields=["parent", "uom", "conversion_factor"],
	):
		factors[row.parent][row.uom] = row.conversion_factor
	items = frappe.get_all("Books Item", filters={"name": ["in", sorted(names)]}, fields=["name", "unit"])
	return {item.name: (item.unit, factors[item.name]) for item in items}


def _whole_units(units):
	if not units:
		return set()
	return set(
		frappe.get_all("Books Uom", filters={"name": ["in", sorted(units)], "is_whole": 1}, pluck="name")
	)
