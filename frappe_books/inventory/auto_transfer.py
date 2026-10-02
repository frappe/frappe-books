"""Create and unwind invoice-driven stock transfers."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.inventory.invoice_balance import pending_quantities
from frappe_books.inventory.transaction import UNSHARED_FIELDS


def create_auto_transfer(invoice) -> str | None:
	"""Submit the matching Shipment or Purchase Receipt for tracked invoice items."""
	if not invoice.get("make_auto_stock_transfer"):
		return None
	rows = _stock_rows(invoice)
	if not rows:
		return None

	is_sales = invoice.transaction_type == "sales"
	doctype = "Books Shipment" if is_sales else "Books Purchase Receipt"
	location = _stock_location(invoice)
	transfer = frappe.get_doc(
		{
			"doctype": doctype,
			"party": invoice.party,
			"date": invoice.date,
			"back_reference": invoice.name,
			"return_against": _returned_transfer(invoice),
			"items": [{**row, "location": location} for row in rows],
		}
	).insert(ignore_permissions=True)
	transfer.submit()
	if not invoice.back_reference:
		frappe.db.set_value(
			invoice.doctype, invoice.name, "back_reference", transfer.name, update_modified=False
		)
		invoice.back_reference = transfer.name
	return transfer.name


def cancel_auto_transfer(invoice) -> None:
	"""Cancel a stock document created for this invoice before invoice cancellation."""
	if not invoice.get("back_reference"):
		return
	doctype = "Books Shipment" if invoice.transaction_type == "sales" else "Books Purchase Receipt"
	if not frappe.db.exists(doctype, invoice.back_reference):
		return
	transfer = frappe.get_doc(doctype, invoice.back_reference)
	if transfer.back_reference != invoice.name or transfer.docstatus != 1:
		return
	transfer.ignore_linked_doctypes = (invoice.doctype,)
	transfer.cancel()


def map_invoice_transfer(invoice_doctype, invoice_name):
	"""Return an unsaved Shipment or Purchase Receipt of what a submitted invoice has not transferred."""
	return get_mapped_doc(
		invoice_doctype,
		invoice_name,
		{
			invoice_doctype: {
				"doctype": frappe.get_meta(invoice_doctype).get_field("back_reference").options,
				"validation": {"docstatus": ["=", 1]},
				"field_map": {"name": "back_reference"},
				"field_no_map": UNSHARED_FIELDS,
			},
		},
		postprocess=_transfer_pending_stock,
	)


def _transfer_pending_stock(invoice, transfer):
	rows = _stock_rows(invoice)
	if not rows:
		frappe.throw(_("Invoice {0} has no stock left to transfer.").format(invoice.name))
	location = default_location(invoice)
	transfer.return_against = _returned_transfer(invoice)
	transfer.set("items", [{**row, "location": location} for row in rows])
	transfer.calculate()


def _returned_transfer(invoice) -> str | None:
	"""Return the original invoice's transfer, as a return transfer must reverse it."""
	if not invoice.get("return_against"):
		return None
	transfer = frappe.db.get_value(invoice.doctype, invoice.return_against, "back_reference")
	# A transfer made by hand from the original does not set the original's back reference.
	transfer = transfer or frappe.db.get_value(
		invoice.meta.get_field("back_reference").options,
		{"back_reference": invoice.return_against, "return_against": ("is", "not set"), "docstatus": 1},
		"name",
		order_by="creation asc",
	)
	if not transfer:
		frappe.throw(
			_("Invoice {0} has no stock transfer to return stock against.").format(invoice.return_against)
		)
	return transfer


def _stock_location(invoice) -> str:
	location = default_location(invoice)
	if location:
		return location
	if _is_pos_sale(invoice):
		frappe.throw(_("POS Inventory is not set. Please set it on POS Settings"))
	label = frappe.get_meta("Books Defaults").get_label(_location_field(invoice))
	frappe.throw(_("Set {0} in Books Defaults to transfer stock automatically.").format(label))


def default_location(invoice) -> str | None:
	"""Return the POS inventory of a POS sale, else the Books Defaults transfer location."""
	if _is_pos_sale(invoice) and (location := _pos_location()):
		return location
	return frappe.db.get_single_value("Books Defaults", _location_field(invoice))


def _is_pos_sale(invoice) -> bool:
	return invoice.transaction_type == "sales" and bool(invoice.get("is_pos"))


def _location_field(invoice) -> str:
	# A quote ships like the sales invoice made from it.
	return "purchase_receipt_location" if invoice.transaction_type == "purchase" else "shipment_location"


def _pos_location() -> str | None:
	settings = frappe.get_single("Books Pos Settings")
	profile_location = settings.pos_profile and frappe.db.get_value(
		"Books Pos Profile", settings.pos_profile, "inventory"
	)
	return profile_location or settings.inventory


def _stock_rows(invoice) -> list[dict]:
	"""Return the rows still to transfer, negative for a return like the invoice's own."""
	pending = pending_quantities(invoice)
	sign = -1 if invoice.get("return_against") else 1
	exchange_rate = as_decimal(invoice.exchange_rate or 1)
	return [
		{
			"item": row.item,
			"transfer_unit": row.transfer_unit or row.unit,
			"transfer_quantity": sign * pending[row.name] / as_decimal(row.unit_conversion_factor or 1),
			"unit": row.unit,
			"batch": row.batch,
			"serial_number": row.serial_number,
			"quantity": sign * pending[row.name],
			"unit_conversion_factor": row.unit_conversion_factor or 1,
			"rate": rounded(as_decimal(row.rate) * exchange_rate),
			"description": row.description,
			"hsn_code": row.hsn_code,
			"item_discount_amount": row.item_discount_amount,
			"item_discount_percent": row.item_discount_percent,
		}
		for row in invoice.items
		if pending.get(row.name)
	]
