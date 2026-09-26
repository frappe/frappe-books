"""Create and unwind invoice-driven stock transfers."""

from __future__ import annotations

from decimal import Decimal

import frappe

from frappe_books.accounting.money import as_decimal, rounded


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
	return_against = None
	if invoice.get("return_against"):
		return_against = frappe.db.get_value(invoice.doctype, invoice.return_against, "back_reference")

	transfer = frappe.get_doc(
		{
			"doctype": doctype,
			"party": invoice.party,
			"date": invoice.date,
			"back_reference": invoice.name,
			"return_against": return_against,
			"items": [{**row, "location": location} for row in rows],
		}
	).insert(ignore_permissions=True)
	transfer.submit()
	frappe.db.set_value(
		invoice.doctype,
		invoice.name,
		{"back_reference": transfer.name, "stock_not_transferred": 0},
		update_modified=False,
	)
	invoice.back_reference = transfer.name
	invoice.stock_not_transferred = 0
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
	exchange_rate = as_decimal(invoice.exchange_rate or 1)
	rows = []
	for row in invoice.items:
		if not frappe.db.get_value("Books Item", row.item, "track_item"):
			continue
		quantity = abs(as_decimal(row.quantity))
		if quantity == Decimal(0):
			continue
		rows.append(
			{
				"item": row.item,
				"transfer_unit": row.transfer_unit or row.unit,
				"transfer_quantity": abs(as_decimal(row.transfer_quantity)) or quantity,
				"unit": row.unit,
				"batch": row.batch,
				"serial_number": row.serial_number,
				"quantity": quantity,
				"unit_conversion_factor": row.unit_conversion_factor or 1,
				"rate": rounded(as_decimal(row.rate) * exchange_rate),
				"description": row.description,
				"hsn_code": row.hsn_code,
			}
		)
	return rows
