from collections import defaultdict

import frappe
from frappe import _

from frappe_books.accounting.money import as_decimal
from frappe_books.inventory.returns import batch_quantities, validate_moved_quantities


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


def validate_invoice_balance(transfer):
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
		store_pending_quantities(_invoice(transfer))


def store_pending_quantities(invoice):
	"""Store what the invoice and each of its rows still have to transfer."""
	pending = pending_quantities(invoice)
	for row in invoice.items:
		row.db_set("stock_not_transferred", pending.get(row.name, 0), update_modified=False)
	invoice.db_set("stock_not_transferred", sum(pending.values()), update_modified=False)


def validate_billed_quantities(invoice):
	"""Stop the invoices made from a transfer from billing more than it moved."""
	transfer = _billed_transfer(invoice, for_update=True)
	if not transfer:
		return
	validate_billable(transfer)
	validate_moved_quantities(
		transfer,
		_billing_rows(transfer, [*_billed_rows(transfer), *invoice.items]),
		_("Invoices of {0} exceed the quantity of {1} in {2}."),
	)


def update_billed_status(invoice):
	"""Flag the transfer an invoice bills as fully billed while its invoices bill all it moved."""
	transfer = _billed_transfer(invoice)
	# A transfer made from the invoice is not billed by it.
	if not transfer or transfer.back_reference:
		return
	is_fully_billed = not any(unbilled_quantities(transfer).values())
	transfer.db_set("is_fully_billed", int(is_fully_billed), update_modified=False)


def validate_billable(transfer):
	"""Allow billing only a submitted transfer that is not a return and was not made from an invoice."""
	if transfer.docstatus != 1:
		frappe.throw(_("{0} must be submitted before it is billed.").format(transfer.name))
	if transfer.back_reference:
		frappe.throw(_("{0} was made from invoice {1}.").format(transfer.name, transfer.back_reference))
	if transfer.return_against:
		frappe.throw(_("A return cannot be billed."))


def bill_unbilled_rows(transfer, invoice):
	"""Keep on an invoice mapped from the transfer only what its invoices have not billed yet."""
	left = unbilled_quantities(transfer)
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


def unbilled_quantities(transfer):
	"""Return what the transfer moved and its invoices have not billed yet, per item and batch."""
	left = batch_quantities(transfer.items)
	for key, quantity in batch_quantities(_billing_rows(transfer, _billed_rows(transfer))).items():
		left[key] -= quantity
	return left


def _invoice(transfer):
	return frappe.get_doc(transfer.meta.get_field("back_reference").options, transfer.back_reference)


def _transferred_quantities(invoice, exclude):
	"""Sum the quantities of the invoice's submitted transfers, including the one it was made from."""
	doctype = invoice.meta.get_field("back_reference").options
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
		frappe.get_meta(doctype).get_field("items").options,
		filters={"parent": ["in", sorted(names)], "parenttype": doctype},
		fields=["item", "quantity"],
	)
	for row in rows:
		quantities[row.item] += abs(as_decimal(row.quantity))
	return quantities


def _billed_transfer(invoice, for_update=False):
	"""Return the transfer an invoice (not a return) references, if any."""
	if not invoice.back_reference or invoice.get("return_against"):
		return None
	doctype = invoice.meta.get_field("back_reference").options
	return frappe.get_doc(doctype, invoice.back_reference, for_update=for_update)


def _billing_rows(transfer, rows):
	"""Return the rows that bill the transfer's items; free items and other lines bill none of it."""
	items = {row.item for row in transfer.items}
	return [row for row in rows if row.item in items and not row.get("is_free_item")]


def _billed_rows(transfer):
	"""Return the item rows of the submitted invoices made from the transfer."""
	doctype = transfer.meta.get_field("back_reference").options
	names = frappe.get_all(
		doctype,
		filters={"back_reference": transfer.name, "return_against": ("is", "not set"), "docstatus": 1},
		pluck="name",
	)
	if not names:
		return []
	return frappe.get_all(
		frappe.get_meta(doctype).get_field("items").options,
		filters={"parenttype": doctype, "parent": ["in", names]},
		# Purchase invoice rows have no is_free_item field.
		fields=["*"],
	)
