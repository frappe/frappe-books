from collections import defaultdict

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.inventory.returns import batch_quantities, validate_moved_quantities

# Fields an invoice and its transfer do not share when one is mapped from the other.
UNSHARED_FIELDS = ["date", "number_series", "terms", "attachment", "is_returned", "return_against"]


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
	doctype = linked_doctype(invoice.doctype)
	transfers = frappe.get_all(
		doctype, filters={"back_reference": invoice.name, "docstatus": 2}, pluck="name"
	)
	if invoice.back_reference in transfers:
		# The link back to the transfer would block deleting it.
		invoice.db_set("back_reference", None, update_modified=False)
	for name in transfers:
		frappe.delete_doc(doctype, name)


def validate_transfer(transfer):
	"""Stop a transfer from moving more of an item than its invoice has left to transfer."""
	if not transfer.back_reference:
		return
	invoice = _invoice(transfer)
	items = {row.name: row.item for row in invoice.items}
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
	"""Return an unsaved Shipment or Purchase Receipt of what a submitted invoice has not transferred."""
	return get_mapped_doc(
		invoice_doctype,
		invoice_name,
		{
			invoice_doctype: {
				"doctype": linked_doctype(invoice_doctype),
				"validation": {"docstatus": ["=", 1]},
				"field_map": {"name": "back_reference"},
				"field_no_map": UNSHARED_FIELDS,
			},
		},
		postprocess=_transfer_pending_stock,
	)


def map_transfer_invoice(transfer_doctype, transfer_name):
	"""Return an unsaved invoice that bills a submitted shipment or purchase receipt."""
	invoice_doctype = linked_doctype(transfer_doctype)
	return get_mapped_doc(
		transfer_doctype,
		transfer_name,
		{
			transfer_doctype: {
				"doctype": invoice_doctype,
				"validation": {"docstatus": ["=", 1]},
				"field_map": {"name": "back_reference"},
				"field_no_map": UNSHARED_FIELDS,
			},
			_items_doctype(transfer_doctype): {"doctype": _items_doctype(invoice_doctype)},
		},
		postprocess=_bill_transfer,
	)


def pending_quantities(invoice, exclude=None):
	"""Return each tracked invoice row's quantity that no submitted transfer has moved yet."""
	transferred = _transferred_quantities(invoice, exclude)
	tracked = set(
		frappe.get_all(
			"Books Item",
			filters={"name": ["in", sorted({row.item for row in invoice.items})], "track_item": 1},
			pluck="name",
		)
	)
	pending = {}
	for row in invoice.items:
		if row.item not in tracked:
			continue
		quantity = abs(as_decimal(row.quantity))
		moved = min(quantity, transferred[row.item])
		transferred[row.item] -= moved
		pending[row.name] = quantity - moved
	return pending


def billed_transfer(invoice, for_update=False):
	"""Return the transfer an invoice (not a return) links to without having made it: the one it bills."""
	if invoice.get("return_against"):
		return None
	transfer = _linked_transfer(invoice, for_update)
	return transfer if transfer and transfer.back_reference != invoice.name else None


def auto_transfer(invoice):
	"""Return the submitted transfer the invoice made on submit.

	It is found by its link back to the invoice, as an invoice that bills a transfer links to that one.
	"""
	if not invoice.get("make_auto_stock_transfer"):
		return None
	doctype = linked_doctype(invoice.doctype)
	name = frappe.db.get_value(doctype, {"back_reference": invoice.name, "docstatus": 1})
	return frappe.get_doc(doctype, name) if name else None


def linked_doctype(doctype) -> str:
	"""Return the transfer doctype of an invoice doctype, or the invoice doctype of a transfer doctype."""
	return frappe.get_meta(doctype).get_field("back_reference").options


def _linked_transfer(invoice, for_update=False):
	if not invoice.get("back_reference"):
		return None
	return frappe.get_doc(linked_doctype(invoice.doctype), invoice.back_reference, for_update=for_update)


def _invoice(transfer):
	return frappe.get_doc(linked_doctype(transfer.doctype), transfer.back_reference)


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
			"doctype": linked_doctype(invoice.doctype),
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


def _store_pending_quantities(invoice):
	"""Store what the invoice and each of its rows still have to transfer."""
	pending = pending_quantities(invoice)
	for row in invoice.items:
		row.db_set("stock_not_transferred", pending.get(row.name, 0), update_modified=False)
	invoice.db_set("stock_not_transferred", sum(pending.values()), update_modified=False)


def _transferred_quantities(invoice, exclude):
	"""Sum the submitted transfers made from the invoice and the one it links to, billed or made automatically."""
	doctype = linked_doctype(invoice.doctype)
	names = set(
		frappe.get_all(doctype, filters={"back_reference": invoice.name, "docstatus": 1}, pluck="name")
	)
	if invoice.back_reference and frappe.db.get_value(doctype, invoice.back_reference, "docstatus") == 1:
		names.add(invoice.back_reference)
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
	"""Keep on an invoice mapped from the transfer only what its invoices have not billed yet."""
	_validate_billable(transfer)
	left = _unbilled_quantities(transfer)
	rows = []
	for row in invoice.items:
		key = (row.item, row.batch or "")
		quantity = min(abs(as_decimal(row.quantity)), left[key])
		left[key] -= quantity
		if quantity > 0:
			row.quantity = quantity
			row.transfer_quantity = quantity / as_decimal(row.unit_conversion_factor or 1)
			rows.append(row)
	if not rows:
		frappe.throw(_("{0} is already fully billed.").format(transfer.name))
	invoice.set("items", rows)
	invoice.fill_mapped_values()


def _unbilled_quantities(transfer):
	"""Return what the transfer moved and its invoices have not billed yet, per item and batch."""
	left = batch_quantities(transfer.items)
	for key, quantity in batch_quantities(_billing_rows(transfer, _billed_rows(transfer))).items():
		left[key] -= quantity
	return left


def _billing_rows(transfer, rows):
	"""Return the rows that bill the transfer's items; free items and other lines bill none of it."""
	items = {row.item for row in transfer.items}
	return [row for row in rows if row.item in items and not row.get("is_free_item")]


def _billed_rows(transfer):
	"""Return the item rows of the submitted invoices made from the transfer."""
	doctype = linked_doctype(transfer.doctype)
	names = frappe.get_all(
		doctype,
		filters={"back_reference": transfer.name, "return_against": ("is", "not set"), "docstatus": 1},
		pluck="name",
	)
	if not names:
		return []
	return frappe.get_all(
		_items_doctype(doctype),
		filters={"parenttype": doctype, "parent": ["in", names]},
		# Purchase invoice rows have no is_free_item field.
		fields=["*"],
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
	doctype = linked_doctype(invoice.doctype)
	# The original links to the transfer it bills or made, but not to one made from it by hand.
	transfer = frappe.db.get_value(invoice.doctype, invoice.return_against, "back_reference")
	transfer = transfer or frappe.db.get_value(
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
