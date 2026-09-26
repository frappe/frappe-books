"""Invoice return validation and the original invoice's return status."""

from collections import defaultdict

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc
from frappe.utils import now_datetime

from frappe_books.accounting.money import as_decimal, currency_unit, sum_decimal
from frappe_books.commerce import loyalty


def map_return(invoice_doctype, invoice_name):
	"""Return an unsaved credit note or purchase return for the whole invoice."""
	item_doctype = frappe.get_meta(invoice_doctype).get_field("items").options
	return get_mapped_doc(
		invoice_doctype,
		invoice_name,
		{
			invoice_doctype: {
				"doctype": invoice_doctype,
				"validation": {"docstatus": ["=", 1]},
				"field_map": {"name": "return_against"},
				"field_no_map": [
					"date",
					"quote",
					"make_auto_payment",
					"redeem_loyalty_points",
					"loyalty_points",
				],
			},
			item_doctype: {"doctype": item_doctype, "postprocess": _negate_quantities},
			"Books Applied Coupon Codes": {"doctype": "Books Applied Coupon Codes", "ignore": True},
		},
		postprocess=_prepare_return,
	)


def _negate_quantities(source_row, target_row, source_parent):
	target_row.quantity = -abs(as_decimal(source_row.quantity))
	target_row.transfer_quantity = -abs(as_decimal(source_row.transfer_quantity))


def _prepare_return(invoice, credit_note):
	if invoice.return_against:
		frappe.throw(_("Create a return from the original invoice."))
	if invoice.is_fully_returned:
		frappe.throw(_("This invoice is already fully returned."))
	credit_note.date = now_datetime()


def validate_return(invoice):
	original = frappe.get_doc(invoice.doctype, invoice.return_against)
	if original.docstatus != 1 or original.get("return_against"):
		frappe.throw(_("Returns can only reference a submitted original invoice."))
	if original.party != invoice.party:
		frappe.throw(_("A return must use the same party as the original invoice."))
	returns, returned_rows = _submitted_returns(original, exclude=invoice.name)
	_validate_quantities(invoice, original, _item_quantities(returned_rows))
	_validate_value(invoice, original, returns, len(returned_rows))


def _validate_quantities(invoice, original, returned_quantities):
	original_quantities = _item_quantities(original.items)
	for item, quantity in _item_quantities(invoice.items).items():
		if item not in original_quantities:
			frappe.throw(_("Item {0} is not present in the original invoice.").format(item))
		if returned_quantities[item] + quantity > original_quantities[item]:
			frappe.throw(_("Returned quantity for item {0} exceeds the original invoice.").format(item))


def _validate_value(invoice, original, returns, returned_row_count):
	returned = sum_decimal(abs(as_decimal(row.grand_total)) for row in returns)
	returned += abs(as_decimal(invoice.grand_total))
	billed = abs(as_decimal(original.grand_total)) + loyalty.redemption_amount(original)
	# Each returned row is rounded on its own, which can add one smallest unit.
	tolerance = currency_unit(invoice.get("currency")) * (returned_row_count + len(invoice.items))
	if returned > billed + tolerance:
		frappe.throw(_("Returns against {0} cannot exceed its value of {1}.").format(original.name, billed))


def update_return_status(return_invoice, *, include_current):
	"""Keep the original invoice's return indicators consistent after submit or cancel."""
	original = frappe.get_doc(return_invoice.doctype, return_invoice.return_against)
	returned_rows = _submitted_returns(original, exclude=return_invoice.name)[1]
	if include_current:
		returned_rows += return_invoice.items
	returned_quantities = _item_quantities(returned_rows)
	original_quantities = _item_quantities(original.items)
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


def _submitted_returns(original, *, exclude=None):
	"""Return the other submitted returns and their item rows."""
	filters = {"return_against": original.name, "docstatus": 1}
	if exclude:
		filters["name"] = ["!=", exclude]
	returns = frappe.get_all(original.doctype, filters=filters, fields=["name", "grand_total"])
	if not returns:
		return [], []
	rows = frappe.get_all(
		original.meta.get_field("items").options,
		filters={
			"parenttype": original.doctype,
			"parentfield": "items",
			"parent": ["in", [row.name for row in returns]],
		},
		fields=["item", "quantity"],
	)
	return returns, rows


def _item_quantities(rows):
	quantities = defaultdict(as_decimal)
	for row in rows:
		quantities[row.item] += abs(as_decimal(row.quantity))
	return quantities
