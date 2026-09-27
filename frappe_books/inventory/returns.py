from collections import defaultdict

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc
from frappe.utils import now_datetime

from frappe_books.accounting.money import as_decimal
from frappe_books.accounting.returns import return_unreturned_rows
from frappe_books.inventory.stock import parse_serial_numbers


def map_transfer_return(doctype, name):
	"""Return an unsaved return of what a transfer moved and earlier returns have not taken back."""
	item_doctype = frappe.get_meta(doctype).get_field("items").options
	return get_mapped_doc(
		doctype,
		name,
		{
			doctype: {
				"doctype": doctype,
				"validation": {"docstatus": ["=", 1]},
				"field_map": {"name": "return_against"},
				# A return does not move stock for the original's invoice.
				"field_no_map": ["date", "back_reference", "is_returned"],
			},
			item_doctype: {"doctype": item_doctype},
		},
		postprocess=_prepare_return,
	)


def _prepare_return(transfer, return_transfer):
	if transfer.return_against:
		frappe.throw(_("Create a return from the original {0}.").format(_(transfer.doctype)))
	return_transfer.date = now_datetime()
	return_unreturned_rows(transfer, return_transfer)
	if not return_transfer.items:
		frappe.throw(_("{0} is already fully returned.").format(transfer.name))
	return_transfer.calculate()


def validate_transfer_return(transfer):
	"""Stop a return from taking back more than its original transfer moved."""
	original = frappe.get_doc(transfer.doctype, transfer.return_against, for_update=True)
	if original.docstatus != 1 or original.return_against:
		frappe.throw(_("A return must reference a submitted original {0}.").format(_(transfer.doctype)))
	returned = _returned_rows(original, exclude=transfer.name)
	_validate_quantities(original, [*returned, *transfer.items])
	_validate_serial_numbers(original, returned, transfer.items)


def _returned_rows(original, exclude):
	"""Return the item rows of the other submitted returns against a transfer."""
	names = frappe.get_all(
		original.doctype,
		filters={"return_against": original.name, "docstatus": 1, "name": ["!=", exclude]},
		pluck="name",
	)
	if not names:
		return []
	return frappe.get_all(
		original.meta.get_field("items").options,
		filters={"parenttype": original.doctype, "parent": ["in", names]},
		fields=["item", "batch", "quantity", "serial_number"],
	)


def _validate_quantities(original, rows):
	moved = _quantities(original.items)
	for (item, batch), quantity in _quantities(rows).items():
		if quantity > moved[(item, batch)]:
			label = f"{item} ({batch})" if batch else item
			frappe.throw(
				_("Returns of {0} exceed the quantity of {1} in {2}.").format(
					label, moved[(item, batch)], original.name
				)
			)


def _validate_serial_numbers(original, returned, rows):
	moved = _serial_numbers(original.items)
	already_returned = _serial_numbers(returned)
	for item, serial_number in sorted(_serial_numbers(rows)):
		if (item, serial_number) not in moved:
			frappe.throw(_("Serial number {0} is not in {1}.").format(serial_number, original.name))
		if (item, serial_number) in already_returned:
			frappe.throw(_("Serial number {0} is already returned.").format(serial_number))


def _quantities(rows):
	quantities = defaultdict(as_decimal)
	for row in rows:
		quantities[(row.item, row.batch or "")] += abs(as_decimal(row.quantity))
	return quantities


def _serial_numbers(rows):
	return {
		(row.item, serial_number) for row in rows for serial_number in parse_serial_numbers(row.serial_number)
	}
