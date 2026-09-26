"""Create and unwind invoice-driven stock transfers."""

from __future__ import annotations

import frappe
from frappe import _

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.inventory.invoice_balance import pending_quantities


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
			"return_against": _returned_transfer(invoice) if invoice.get("return_against") else None,
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
	transfer.flags.ignore_links = True
	transfer.cancel()


def _returned_transfer(invoice) -> str:
	"""Return the original invoice's transfer, as a return transfer must reverse it."""
	transfer = frappe.db.get_value(invoice.doctype, invoice.return_against, "back_reference")
	if not transfer:
		frappe.throw(
			_("Invoice {0} has no stock transfer to return stock against.").format(invoice.return_against)
		)
	return transfer


def _stock_location(invoice) -> str:
	if invoice.flags.get("stock_location"):
		return invoice.flags.stock_location
	if invoice.transaction_type == "sales" and invoice.get("is_pos"):
		settings = frappe.get_single("Books Pos Settings")
		location = (
			frappe.db.get_value("Books Pos Profile", settings.pos_profile, "inventory")
			if settings.pos_profile
			else None
		)
		if location or settings.inventory:
			return location or settings.inventory
	field = "shipment_location" if invoice.transaction_type == "sales" else "purchase_receipt_location"
	return frappe.db.get_single_value("Books Defaults", field) or "Stores"


def _stock_rows(invoice) -> list[dict]:
	pending = pending_quantities(invoice)
	exchange_rate = as_decimal(invoice.exchange_rate or 1)
	return [
		{
			"item": row.item,
			"transfer_unit": row.transfer_unit or row.unit,
			"transfer_quantity": pending[row.name] / as_decimal(row.unit_conversion_factor or 1),
			"unit": row.unit,
			"batch": row.batch,
			"serial_number": row.serial_number,
			"quantity": pending[row.name],
			"unit_conversion_factor": row.unit_conversion_factor or 1,
			"rate": rounded(as_decimal(row.rate) * exchange_rate),
			"description": row.description,
			"hsn_code": row.hsn_code,
		}
		for row in invoice.items
		if pending.get(row.name)
	]
