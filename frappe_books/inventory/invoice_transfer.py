from collections import defaultdict

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.inventory.returns import batch_quantities, validate_moved_quantities
from frappe_books.status import store_status

# Fields an invoice and its transfer do not share when one is mapped from the other.
UNSHARED_FIELDS = ["posting_date", "posting_time", "naming_series", "terms", "is_return", "return_against"]
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
# The transfer row fields that link a row to the invoice row whose stock it moves, as ERPNext names them.
SOURCE_LINK_FIELDS = {
	"Books Delivery Note": ("against_sales_invoice", "si_detail"),
	"Books Purchase Receipt": ("purchase_invoice", "purchase_invoice_item"),
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
	for name in _source_transfers(invoice, docstatus=2):
		frappe.delete_doc(doctype, name)


def validate_transfer(transfer):
	"""Stop a transfer from moving more of an invoice row than the row has left to transfer."""
	invoice = _source_invoice(transfer)
	if not invoice:
		return
	items = {row.name: row.item_code for row in invoice.items}
	left = pending_quantities(invoice, exclude=transfer.name)
	detail_field = SOURCE_LINK_FIELDS[transfer.doctype][1]
	requested = defaultdict(as_decimal)
	for row in transfer.items:
		requested[row.get(detail_field)] += abs(as_decimal(row.stock_qty))
	for detail, quantity in requested.items():
		if detail in left and quantity > left[detail]:
			frappe.throw(
				_("Invoice {0} has only {1} of {2} left to transfer.").format(
					invoice.name, left[detail], items[detail]
				)
			)


def update_invoice_balance(transfer):
	"""Store what the transfer's invoice still has to transfer after a submit or cancel."""
	invoice = _source_invoice(transfer)
	if invoice:
		_store_pending_quantities(invoice)


def map_invoice_transfer(invoice_doctype, invoice_name):
	"""Return an unsaved Delivery Note or Purchase Receipt of what a submitted invoice has not transferred."""
	return get_mapped_doc(
		invoice_doctype,
		invoice_name,
		{
			invoice_doctype: {
				"doctype": TRANSFER_DOCTYPES[invoice_doctype],
				"validation": {"docstatus": ["=", 1]},
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
				"field_map": {"parent": link_field, "name": detail_field},
				# The invoice prices its rows from their price list rate; `_bill_transfer` sets it.
				"field_no_map": [
					"rate",
					"amount",
					"stock_uom_rate",
					"discount_amount",
					"discount_percentage",
				],
			},
		},
		postprocess=_bill_transfer,
	)


def pending_quantities(invoice, exclude=None):
	"""Return each tracked invoice row's stock quantity that no submitted transfer has moved yet."""
	moved = _moved_quantities(invoice, exclude)
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
		pending[row.name] = max(abs(as_decimal(row.stock_qty)) - moved[row.name], 0)
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
	names = _source_transfers(invoice, docstatus=1)
	return frappe.get_doc(TRANSFER_DOCTYPES[invoice.doctype], names[0]) if names else None


def source_invoice_name(transfer) -> str | None:
	"""Return the invoice a delivery note or receipt moves the stock of, which its rows link to."""
	link_field = SOURCE_LINK_FIELDS[transfer.doctype][0]
	return next((row.get(link_field) for row in transfer.items if row.get(link_field)), None)


def _source_invoice(transfer):
	name = source_invoice_name(transfer)
	return frappe.get_doc(INVOICE_DOCTYPES[transfer.doctype], name) if name else None


def _source_transfers(invoice, **filters):
	"""Return the delivery notes or receipts made from the invoice, oldest first; their rows link to it."""
	doctype = TRANSFER_DOCTYPES[invoice.doctype]
	link_field = SOURCE_LINK_FIELDS[doctype][0]
	names = frappe.get_all(
		_items_doctype(doctype),
		filters={"parenttype": doctype, link_field: invoice.name},
		pluck="parent",
		distinct=True,
	)
	if not names:
		return []
	return frappe.get_all(
		doctype, filters={"name": ["in", names], **filters}, pluck="name", order_by="creation asc"
	)


def _billed_transfer_name(invoice_doctype, rows):
	link_field = ROW_LINK_FIELDS[invoice_doctype][0]
	return next((row.get(link_field) for row in rows if row.get(link_field)), None)


def _items_doctype(doctype):
	return frappe.get_meta(doctype).get_field("items").options


def _create_auto_transfer(invoice) -> str | None:
	"""Submit a transfer of the tracked invoice rows still to transfer and return its name."""
	if not invoice.get("make_auto_stock_transfer"):
		return None
	rows = _stock_rows(invoice)
	if not rows:
		return None
	warehouse = _stock_location(invoice)
	transfer = frappe.get_doc(
		{
			"doctype": TRANSFER_DOCTYPES[invoice.doctype],
			invoice.party_field: invoice.party,
			"posting_date": invoice.posting_date,
			"posting_time": invoice.posting_time,
			"return_against": _returned_transfer(invoice),
			"items": [{**row, "warehouse": warehouse} for row in rows],
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


def _moved_quantities(invoice, exclude):
	"""Sum by invoice row what the submitted transfers made from it moved; a row that bills a submitted
	transfer moved all its stock."""
	doctype = TRANSFER_DOCTYPES[invoice.doctype]
	link_field, detail_field = SOURCE_LINK_FIELDS[doctype]
	filters = {"parenttype": doctype, link_field: invoice.name, "docstatus": 1}
	if exclude:
		filters["parent"] = ["!=", exclude]
	moved = defaultdict(as_decimal)
	for row in frappe.get_all(_items_doctype(doctype), filters=filters, fields=[detail_field, "stock_qty"]):
		moved[row[detail_field]] += abs(as_decimal(row.stock_qty))
	billed = _billed_transfer_name(invoice.doctype, invoice.items)
	if billed and billed != exclude and frappe.db.get_value(doctype, billed, "docstatus") == 1:
		billed_field = ROW_LINK_FIELDS[invoice.doctype][0]
		for row in invoice.items:
			if row.get(billed_field) == billed:
				moved[row.name] += abs(as_decimal(row.stock_qty))
	return moved


def _update_billed_status(invoice):
	"""Store the share of the stock in the transfer an invoice bills that its invoices bill, and its status."""
	transfer = billed_transfer(invoice)
	if not transfer:
		return
	moved = sum(batch_quantities(transfer.items).values())
	unbilled = sum(max(quantity, 0) for quantity in _unbilled_quantities(transfer).values())
	transfer.per_billed = flt((moved - unbilled) / moved * 100, 2) if moved else 0
	transfer.db_set("per_billed", transfer.per_billed, update_modified=False)
	store_status(transfer)


def _validate_billable(transfer):
	"""Allow billing only a submitted transfer that is not a return and was not made from an invoice."""
	if transfer.docstatus != 1:
		frappe.throw(_("{0} must be submitted before it is billed.").format(transfer.name))
	if invoice := source_invoice_name(transfer):
		frappe.throw(_("{0} was made from invoice {1}.").format(transfer.name, invoice))
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
	row.stock_qty = stock_qty
	row.qty = stock_qty / as_decimal(row.conversion_factor or 1)
	# A transfer row's rate is net of its discount per unit, as an invoice row's is.
	row.price_list_rate = as_decimal(source.rate) + as_decimal(source.discount_amount)
	row.discount_percentage = source.discount_percentage
	if not as_decimal(source.discount_percentage):
		row.discount_amount = source.discount_amount


def _unbilled_quantities(transfer):
	"""Return what the transfer moved and its invoices have not billed yet, per item and batch."""
	left = batch_quantities(transfer.items)
	for key, quantity in batch_quantities(_billing_rows(transfer, _billed_rows(transfer))).items():
		left[key] -= quantity
	return left


def _billing_rows(transfer, rows):
	"""Return the rows that bill the transfer's items; free items and other lines bill none of it."""
	items = {row.item_code for row in transfer.items}
	return [row for row in rows if row.get("item_code") in items and not row.get("is_free_item")]


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
	warehouse = default_location(invoice)
	transfer.return_against = _returned_transfer(invoice)
	transfer.set("items", [{**row, "warehouse": warehouse} for row in rows])
	transfer.calculate()


def _returned_transfer(invoice) -> str | None:
	"""Return the original invoice's transfer, as a return transfer must reverse it."""
	if not invoice.get("return_against"):
		return None
	# The transfer the original bills, else the one made from it, on submit or by hand.
	original = frappe.get_doc(invoice.doctype, invoice.return_against)
	transfer = _billed_transfer_name(invoice.doctype, original.items) or next(
		iter(_source_transfers(original, return_against=("is", "not set"), docstatus=1)), None
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
		frappe.throw(_("POS Warehouse is not set. Please set it on POS Settings"))
	label = frappe.get_meta("Books Defaults").get_label(_location_field(invoice))
	frappe.throw(_("Set {0} in Books Defaults to transfer stock automatically.").format(label))


def _is_pos_sale(invoice) -> bool:
	return invoice.transaction_type == "sales" and bool(invoice.get("is_pos"))


def _location_field(invoice) -> str:
	# A quote ships like the sales invoice made from it.
	return "purchase_receipt_location" if invoice.transaction_type == "purchase" else "delivery_note_location"


def _pos_location() -> str | None:
	settings = frappe.get_single("Books POS Settings")
	profile_location = settings.pos_profile and frappe.db.get_value(
		"Books POS Profile", settings.pos_profile, "warehouse"
	)
	return profile_location or settings.warehouse


def _stock_rows(invoice) -> list[dict]:
	"""Return the rows still to transfer, negative for a return like the invoice's own, linked to their
	invoice rows. A transfer row's rate and discount are per its unit, in the company currency."""
	pending = pending_quantities(invoice)
	sign = -1 if invoice.get("return_against") else 1
	exchange_rate = as_decimal(invoice.conversion_rate or 1)
	link_field, detail_field = SOURCE_LINK_FIELDS[TRANSFER_DOCTYPES[invoice.doctype]]
	rows = []
	for row in invoice.items:
		if not pending.get(row.name):
			continue
		rows.append(
			{
				"item_code": row.item_code,
				"item_name": row.item_name,
				"description": row.description,
				"uom": row.uom or row.stock_uom,
				"qty": sign * pending[row.name] / as_decimal(row.conversion_factor or 1),
				"stock_uom": row.stock_uom,
				"stock_qty": sign * pending[row.name],
				"conversion_factor": row.conversion_factor or 1,
				"batch_no": row.batch_no,
				"serial_no": row.serial_no,
				"rate": rounded(as_decimal(row.rate) * exchange_rate),
				"discount_amount": rounded(as_decimal(row.discount_amount) * exchange_rate),
				"discount_percentage": row.discount_percentage,
				"gst_hsn_code": row.gst_hsn_code,
				link_field: invoice.name,
				detail_field: row.name,
			}
		)
	return rows
