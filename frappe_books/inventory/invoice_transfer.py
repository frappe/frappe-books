from collections import defaultdict

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.dates import posting_datetime
from frappe_books.inventory.returns import batch_quantities, validate_moved_quantities
from frappe_books.inventory.row_fields import row_values

# Fields an invoice and its transfer do not share when one is mapped from the other.
UNSHARED_FIELDS = ["date", "naming_series", "terms", "attachment", "is_returned", "return_against"]
# Each invoice's transfer doctype, and the row fields that link a row to the transfer row it bills.
TRANSFER_DOCTYPES = {
	"Books Sales Invoice": "Books Delivery Note",
	"Books Purchase Invoice": "Books Purchase Receipt",
}
INVOICE_DOCTYPES = {transfer: invoice for invoice, transfer in TRANSFER_DOCTYPES.items()}
ROW_LINK_FIELDS = {
	"Books Sales Invoice": ("delivery_note", "dn_detail"),
	"Books Purchase Invoice": ("purchase_receipt", "pr_detail"),
}
# A transfer row's fields under the invoice row's names; transfer rows keep Books' names for now.
TRANSFER_ROW_FIELDS = {
	"item": "item_code",
	"transfer_unit": "uom",
	"transfer_quantity": "qty",
	"unit": "stock_uom",
	"quantity": "stock_qty",
	"unit_conversion_factor": "conversion_factor",
	"batch": "batch_no",
	"serial_number": "serial_no",
	"hsn_code": "gst_hsn_code",
}


def default_location(invoice) -> str | None:
	"""Return the POS inventory of a POS sale, else the Books Defaults transfer location."""
	if _is_pos_sale(invoice) and (location := _pos_location()):
		return location
	return frappe.db.get_single_value("Books Defaults", _location_field(invoice))


def validate_invoice(invoice):
	"""Stop an invoice and the others made from its transfer from billing more than the transfer moved."""
	transfer = billed_transfer(invoice, for_update=True)
	if not transfer:
		return
	_validate_billable(transfer)
	validate_moved_quantities(
		transfer,
		_billing_rows(transfer, [*_billed_rows(transfer), *invoice.items]),
		_("Invoices of {0} exceed the quantity of {1} in {2}."),
	)


def on_invoice_submit(invoice):
	"""Update the transfer the invoice bills, then transfer its stock or store what it has left to transfer."""
	_update_billed_status(invoice)
	# Submitting the automatic transfer stores what the invoice has left to transfer.
	if not _create_auto_transfer(invoice):
		_store_pending_quantities(invoice)


def before_invoice_cancel(invoice):
	"""Cancel the transfer made automatically from the invoice."""
	transfer = auto_transfer(invoice)
	if transfer:
		transfer.ignore_linked_doctypes = (invoice.doctype,)
		transfer.cancel()


def on_invoice_cancel(invoice):
	"""Update the transfer the invoice billed."""
	_update_billed_status(invoice)


def delete_cancelled_transfers(invoice):
	"""Delete the cancelled transfers made from the invoice, with the user's rights."""
	doctype = TRANSFER_DOCTYPES[invoice.doctype]
	for name in frappe.get_all(
		doctype, filters={"back_reference": invoice.name, "docstatus": 2}, pluck="name"
	):
		frappe.delete_doc(doctype, name)


def validate_transfer(transfer):
	"""Stop a transfer from moving more of an item than its invoice has left to transfer."""
	if not transfer.back_reference:
		return
	invoice = _invoice(transfer)
	items = {row.name: row.item_code for row in invoice.items}
	left = defaultdict(as_decimal)
	for row_name, quantity in pending_quantities(invoice, exclude=transfer.name).items():
		left[items[row_name]] += quantity
	requested = defaultdict(as_decimal)
	for row in transfer.items:
		requested[row.item] += abs(as_decimal(row.quantity))
	for item, quantity in requested.items():
		if item in left and quantity > left[item]:
			frappe.throw(
				_("Invoice {0} has only {1} of {2} left to transfer.").format(invoice.name, left[item], item)
			)


def update_invoice_balance(transfer):
	"""Store what the transfer's invoice still has to transfer after a submit or cancel."""
	if transfer.back_reference:
		_store_pending_quantities(_invoice(transfer))


def map_invoice_transfer(invoice_doctype, invoice_name):
	"""Return an unsaved Delivery Note or Purchase Receipt of what a submitted invoice has not transferred."""
	return get_mapped_doc(
		invoice_doctype,
		invoice_name,
		{
			invoice_doctype: {
				"doctype": TRANSFER_DOCTYPES[invoice_doctype],
				"validation": {"docstatus": ["=", 1]},
				"field_map": {"name": "back_reference"},
				"field_no_map": UNSHARED_FIELDS,
			},
		},
		postprocess=_transfer_pending_stock,
	)


def map_transfer_invoice(transfer_doctype, transfer_name):
	"""Return an unsaved invoice that bills a submitted shipment or purchase receipt, row by row."""
	invoice_doctype = INVOICE_DOCTYPES[transfer_doctype]
	link_field, detail_field = ROW_LINK_FIELDS[invoice_doctype]
	return get_mapped_doc(
		transfer_doctype,
		transfer_name,
		{
			transfer_doctype: {
				"doctype": invoice_doctype,
				"validation": {"docstatus": ["=", 1]},
				"field_no_map": UNSHARED_FIELDS,
			},
			_items_doctype(transfer_doctype): {
				"doctype": _items_doctype(invoice_doctype),
				"field_map": {**TRANSFER_ROW_FIELDS, "parent": link_field, "name": detail_field},
				# The invoice prices its rows per its unit; `_bill_transfer` converts the transfer's rate.
				"field_no_map": ["rate", "amount", "item_discount_amount", "item_discount_percent"],
			},
		},
		postprocess=_bill_transfer,
	)


def pending_quantities(invoice, exclude=None):
	"""Return each tracked invoice row's stock quantity that no submitted transfer has moved yet."""
	transferred = _transferred_quantities(invoice, exclude)
	tracked = set(
		frappe.get_all(
			"Books Item",
			filters={"name": ["in", sorted({row.item_code for row in invoice.items})], "is_stock_item": 1},
			pluck="name",
		)
	)
	pending = {}
	for row in invoice.items:
		if row.item_code not in tracked:
			continue
		quantity = abs(as_decimal(row.stock_qty))
		moved = min(quantity, transferred[row.item_code])
		transferred[row.item_code] -= moved
		pending[row.name] = quantity - moved
	return pending


def billed_transfer(invoice, for_update=False):
	"""Return the transfer an invoice (not a return) bills, which its rows link to."""
	if invoice.get("return_against"):
		return None
	name = _billed_transfer_name(invoice.doctype, invoice.items)
	return frappe.get_doc(TRANSFER_DOCTYPES[invoice.doctype], name, for_update=for_update) if name else None


def auto_transfer(invoice):
	"""Return the submitted transfer the invoice made on submit, which links back to the invoice."""
	if not invoice.get("make_auto_stock_transfer"):
		return None
	doctype = TRANSFER_DOCTYPES[invoice.doctype]
	name = frappe.db.get_value(doctype, {"back_reference": invoice.name, "docstatus": 1})
	return frappe.get_doc(doctype, name) if name else None


def _billed_transfer_name(invoice_doctype, rows):
	link_field = ROW_LINK_FIELDS[invoice_doctype][0]
	return next((row.get(link_field) for row in rows if row.get(link_field)), None)


def _invoice(transfer):
	return frappe.get_doc(INVOICE_DOCTYPES[transfer.doctype], transfer.back_reference)


def _items_doctype(doctype):
	return frappe.get_meta(doctype).get_field("items").options


def _create_auto_transfer(invoice) -> str | None:
	"""Submit a transfer of the tracked invoice rows still to transfer and return its name."""
	if not invoice.get("make_auto_stock_transfer"):
		return None
	rows = _stock_rows(invoice)
	if not rows:
		return None
	location = _stock_location(invoice)
	transfer = frappe.get_doc(
		{
			"doctype": TRANSFER_DOCTYPES[invoice.doctype],
			invoice.party_field: invoice.party,
			"date": posting_datetime(invoice.posting_date, invoice.posting_time),
			"back_reference": invoice.name,
			"return_against": _returned_transfer(invoice),
			"items": [{**row, "location": location} for row in rows],
		}
	).insert(ignore_permissions=True)
	transfer.submit()
	return transfer.name


def _store_pending_quantities(invoice):
	"""Store what each row has transferred, in its unit, and what the invoice has left to transfer."""
	pending = pending_quantities(invoice)
	sign = -1 if invoice.get("return_against") else 1
	moved_field = "received_qty" if invoice.doctype == "Books Purchase Invoice" else "delivered_qty"
	for row in invoice.items:
		moved = abs(as_decimal(row.stock_qty)) - pending[row.name] if row.name in pending else 0
		row.db_set(moved_field, sign * moved / as_decimal(row.conversion_factor or 1), update_modified=False)
	if invoice.doctype == "Books Purchase Invoice":
		invoice.db_set("per_received", _per_received(invoice, pending), update_modified=False)
	else:
		invoice.db_set("stock_not_transferred", sum(pending.values()), update_modified=False)


def _per_received(invoice, pending):
	"""The share of the tracked rows' stock quantity received; all of it when no row tracks stock."""
	tracked = sum(abs(as_decimal(row.stock_qty)) for row in invoice.items if row.name in pending)
	if not tracked:
		return 100
	return flt((tracked - sum(pending.values())) / tracked * 100, 2)


def _transferred_quantities(invoice, exclude):
	"""Sum the submitted transfers made from the invoice and the one it bills."""
	doctype = TRANSFER_DOCTYPES[invoice.doctype]
	names = set(
		frappe.get_all(doctype, filters={"back_reference": invoice.name, "docstatus": 1}, pluck="name")
	)
	billed = _billed_transfer_name(invoice.doctype, invoice.items)
	if billed and frappe.db.get_value(doctype, billed, "docstatus") == 1:
		names.add(billed)
	names.discard(exclude)
	quantities = defaultdict(as_decimal)
	if not names:
		return quantities
	rows = frappe.get_all(
		_items_doctype(doctype),
		filters={"parent": ["in", sorted(names)], "parenttype": doctype},
		fields=["item", "quantity"],
	)
	for row in rows:
		quantities[row.item] += abs(as_decimal(row.quantity))
	return quantities


def _update_billed_status(invoice):
	"""Flag the transfer an invoice bills as fully billed while its invoices bill all it moved."""
	transfer = billed_transfer(invoice)
	if transfer:
		is_fully_billed = not any(_unbilled_quantities(transfer).values())
		transfer.db_set("is_fully_billed", int(is_fully_billed), update_modified=False)


def _validate_billable(transfer):
	"""Allow billing only a submitted transfer that is not a return and was not made from an invoice."""
	if transfer.docstatus != 1:
		frappe.throw(_("{0} must be submitted before it is billed.").format(transfer.name))
	if transfer.back_reference:
		frappe.throw(_("{0} was made from invoice {1}.").format(transfer.name, transfer.back_reference))
	if transfer.return_against:
		frappe.throw(_("A return cannot be billed."))


def _bill_transfer(transfer, invoice):
	"""Keep on an invoice mapped from the transfer only what its invoices have not billed yet, at the
	transfer's rates and discounts per the row's unit."""
	_validate_billable(transfer)
	left = _unbilled_quantities(transfer)
	sources = {row.name: row for row in transfer.items}
	detail_field = ROW_LINK_FIELDS[invoice.doctype][1]
	rows = []
	for row in invoice.items:
		key = (row.item_code, row.batch_no or "")
		quantity = min(abs(as_decimal(row.stock_qty)), left[key])
		left[key] -= quantity
		if quantity > 0:
			_bill_row(row, sources[row.get(detail_field)], quantity)
			rows.append(row)
	if not rows:
		frappe.throw(_("{0} is already fully billed.").format(transfer.name))
	invoice.set("items", rows)
	invoice.fill_mapped_values()


def _bill_row(row, source, stock_qty):
	factor = as_decimal(row.conversion_factor or 1)
	row.stock_qty = stock_qty
	row.qty = stock_qty / factor
	row.price_list_rate = as_decimal(source.rate) * factor
	row.discount_percentage = source.item_discount_percent
	# A transfer row's discount amount is for the whole row; an invoice row's is per unit.
	if not as_decimal(source.item_discount_percent) and as_decimal(source.transfer_quantity):
		row.discount_amount = as_decimal(source.item_discount_amount) / abs(
			as_decimal(source.transfer_quantity)
		)


def _unbilled_quantities(transfer):
	"""Return what the transfer moved and its invoices have not billed yet, per item and batch."""
	left = batch_quantities(transfer.items)
	for key, quantity in batch_quantities(_billing_rows(transfer, _billed_rows(transfer))).items():
		left[key] -= quantity
	return left


def _billing_rows(transfer, rows):
	"""Return the rows that bill the transfer's items; free items and other lines bill none of it."""
	items = {row.item for row in transfer.items}
	return [row for row in rows if row_values(row, "item")[0] in items and not row.get("is_free_item")]


def _billed_rows(transfer):
	"""Return the item rows of the submitted invoices, not returns, that bill the transfer."""
	doctype = INVOICE_DOCTYPES[transfer.doctype]
	items_doctype = _items_doctype(doctype)
	link_field = ROW_LINK_FIELDS[doctype][0]
	# Purchase invoice rows have no is_free_item field.
	rows = frappe.get_all(
		items_doctype,
		filters={"parenttype": doctype, link_field: transfer.name, "docstatus": 1},
		fields=["*"],
	)
	if not rows:
		return []
	invoices = set(
		frappe.get_all(
			doctype,
			filters={
				"name": ["in", sorted({row.parent for row in rows})],
				"return_against": ("is", "not set"),
			},
			pluck="name",
		)
	)
	return [row for row in rows if row.parent in invoices]


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
	doctype = TRANSFER_DOCTYPES[invoice.doctype]
	# The transfer the original bills, else the one made from it, on submit or by hand.
	original = frappe.get_doc(invoice.doctype, invoice.return_against)
	transfer = _billed_transfer_name(invoice.doctype, original.items) or frappe.db.get_value(
		doctype,
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


def _is_pos_sale(invoice) -> bool:
	return invoice.transaction_type == "sales" and bool(invoice.get("is_pos"))


def _location_field(invoice) -> str:
	# A quote ships like the sales invoice made from it.
	return "purchase_receipt_location" if invoice.transaction_type == "purchase" else "delivery_note_location"


def _pos_location() -> str | None:
	settings = frappe.get_single("Books Pos Settings")
	profile_location = settings.pos_profile and frappe.db.get_value(
		"Books Pos Profile", settings.pos_profile, "inventory"
	)
	return profile_location or settings.inventory


def _stock_rows(invoice) -> list[dict]:
	"""Return the rows still to transfer, negative for a return like the invoice's own, under the
	transfer rows' names. A transfer row's rate is per stock unit, in the company currency."""
	pending = pending_quantities(invoice)
	sign = -1 if invoice.get("return_against") else 1
	exchange_rate = as_decimal(invoice.conversion_rate or 1)
	rows = []
	for row in invoice.items:
		if not pending.get(row.name):
			continue
		factor = as_decimal(row.conversion_factor or 1)
		qty = pending[row.name] / factor
		rows.append(
			{
				"item": row.item_code,
				"transfer_unit": row.uom or row.stock_uom,
				"transfer_quantity": sign * qty,
				"unit": row.stock_uom,
				"batch": row.batch_no,
				"serial_number": row.serial_no,
				"quantity": sign * pending[row.name],
				"unit_conversion_factor": row.conversion_factor or 1,
				"rate": rounded(as_decimal(row.price_list_rate) * exchange_rate / factor),
				"description": row.description,
				"hsn_code": row.gst_hsn_code,
				"item_discount_amount": rounded(
					as_decimal(row.discount_amount) * qty, invoice.get("currency")
				),
				"item_discount_percent": row.discount_percentage,
			}
		)
	return rows
