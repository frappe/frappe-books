from collections import defaultdict

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt

from frappe_books.accounting.money import as_decimal
from frappe_books.accounting.returns import return_unreturned_rows
from frappe_books.inventory.stock import parse_serial_numbers
from frappe_books.settings import require_feature


def map_transfer_return(doctype, name):
	"""Return an unsaved return of what a transfer moved and earlier returns have not taken back."""
	require_feature("enable_invoice_returns")
	item_doctype = frappe.get_meta(doctype).get_field("items").options
	return get_mapped_doc(
		doctype,
		name,
		{
			doctype: {
				"doctype": doctype,
				"validation": {"docstatus": ["=", 1]},
				"field_map": {"name": "return_against"},
				"field_no_map": ["posting_date", "posting_time"],
			},
			item_doctype: {"doctype": item_doctype},
		},
		postprocess=_prepare_return,
	)


def _prepare_return(transfer, return_transfer):
	if transfer.return_against:
		frappe.throw(_("Create a return from the original {0}.").format(_(transfer.doctype)))
	return_unreturned_rows(transfer, return_transfer)
	if not return_transfer.items:
		frappe.throw(_("{0} is already fully returned.").format(transfer.name))
	return_transfer.calculate()


def validate_transfer_return(transfer):
	"""Stop a return from taking back more than its original transfer moved, or before it moved it."""
	original = frappe.get_doc(transfer.doctype, transfer.return_against, for_update=True)
	if original.docstatus != 1 or original.return_against:
		frappe.throw(_("A return must reference a submitted original {0}.").format(_(transfer.doctype)))
	# A sales return is valued at its shipment's cost, which must not depend on the return.
	if transfer.posting_datetime() < original.posting_datetime():
		frappe.throw(_("A return cannot be dated before its original {0}.").format(original.name))
	returned = _returned_rows(original, exclude=transfer.name)
	validate_moved_quantities(
		original, [*returned, *transfer.items], _("Returns of {0} exceed the quantity of {1} in {2}.")
	)
	_validate_serial_numbers(original, returned, transfer.items)


def update_returned_percent(transfer):
	"""Store on a return's original the share of its stock quantity that submitted returns take back."""
	if not transfer.return_against:
		return
	original = frappe.get_doc(transfer.doctype, transfer.return_against)
	moved = sum(abs(as_decimal(row.stock_qty)) for row in original.items)
	returned = sum(abs(as_decimal(row.stock_qty)) for row in _returned_rows(original))
	per_returned = flt(returned / moved * 100, 2) if moved else 0
	frappe.db.set_value(
		original.doctype, original.name, "per_returned", min(per_returned, 100), update_modified=False
	)


def _returned_rows(original, exclude=None):
	"""Return the item rows of the submitted returns against a transfer, but the excluded one."""
	filters = {"return_against": original.name, "docstatus": 1}
	if exclude:
		filters["name"] = ["!=", exclude]
	names = frappe.get_all(original.doctype, filters=filters, pluck="name")
	if not names:
		return []
	return frappe.get_all(
		original.meta.get_field("items").options,
		filters={"parenttype": original.doctype, "parent": ["in", names]},
		fields=["item_code", "batch_no", "stock_qty", "serial_no"],
	)


def validate_moved_quantities(transfer, rows, message):
	"""Throw `message` when the rows hold more of an item and batch than the transfer moved."""
	moved = batch_quantities(transfer.items)
	for (item, batch), quantity in batch_quantities(rows).items():
		if quantity > moved[(item, batch)]:
			label = f"{item} ({batch})" if batch else item
			frappe.throw(message.format(label, moved[(item, batch)], transfer.name))


def _validate_serial_numbers(original, returned, rows):
	moved = _serial_numbers(original.items)
	already_returned = _serial_numbers(returned)
	for item, serial_number in sorted(_serial_numbers(rows)):
		if (item, serial_number) not in moved:
			frappe.throw(_("Serial number {0} is not in {1}.").format(serial_number, original.name))
		if (item, serial_number) in already_returned:
			frappe.throw(_("Serial number {0} is already returned.").format(serial_number))


def batch_quantities(rows):
	"""Sum the rows' stock quantities by item and batch."""
	quantities = defaultdict(as_decimal)
	for row in rows:
		quantities[(row.get("item_code"), row.get("batch_no") or "")] += abs(as_decimal(row.get("stock_qty")))
	return quantities


def _serial_numbers(rows):
	return {
		(row.get("item_code"), serial_number)
		for row in rows
		for serial_number in parse_serial_numbers(row.get("serial_no"))
	}
