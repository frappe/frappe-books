"""Invoice return validation and the original invoice's return status."""

from collections import defaultdict

import frappe
from frappe import _

from frappe_books.accounting.money import as_decimal


def validate_return(invoice):
	if not frappe.db.exists(invoice.doctype, invoice.return_against):
		frappe.throw(_("Return-against invoice {0} does not exist.").format(invoice.return_against))
	original = frappe.get_doc(invoice.doctype, invoice.return_against)
	if original.docstatus != 1 or original.get("return_against"):
		frappe.throw(_("Returns can only reference a submitted original invoice."))
	if original.party != invoice.party:
		frappe.throw(_("A return must use the same party as the original invoice."))

	original_quantities = _item_quantities(original)
	returned_quantities = _submitted_return_quantities(original, exclude=invoice.name)
	for item, quantity in _item_quantities(invoice).items():
		if item not in original_quantities:
			frappe.throw(_("Item {0} is not present in the original invoice.").format(item))
		if returned_quantities[item] + quantity > original_quantities[item]:
			frappe.throw(_("Returned quantity for item {0} exceeds the original invoice.").format(item))


def update_return_status(return_invoice, *, include_current):
	"""Keep the original invoice's return indicators consistent after submit or cancel."""
	original = frappe.get_doc(return_invoice.doctype, return_invoice.return_against)
	returned_quantities = _submitted_return_quantities(original, exclude=return_invoice.name)
	if include_current:
		for item, quantity in _item_quantities(return_invoice).items():
			returned_quantities[item] += quantity

	original_quantities = _item_quantities(original)
	is_returned = any(returned_quantities.values())
	is_fully_returned = bool(original_quantities) and all(
		returned_quantities[item] >= quantity for item, quantity in original_quantities.items()
	)
	frappe.db.set_value(
		original.doctype,
		original.name,
		{"is_returned": int(is_returned), "is_fully_returned": int(is_fully_returned)},
		update_modified=False,
	)


def _submitted_return_quantities(original, *, exclude=None):
	quantities = defaultdict(as_decimal)
	return_names = frappe.get_all(
		original.doctype,
		filters={"return_against": original.name, "docstatus": 1},
		pluck="name",
	)
	for name in return_names:
		if name == exclude:
			continue
		for item, quantity in _item_quantities(frappe.get_doc(original.doctype, name)).items():
			quantities[item] += quantity
	return quantities


def _item_quantities(invoice):
	quantities = defaultdict(as_decimal)
	for row in invoice.items:
		quantities[row.item] += abs(as_decimal(row.quantity))
	return quantities
