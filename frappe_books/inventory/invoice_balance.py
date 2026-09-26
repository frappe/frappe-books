from collections import defaultdict

import frappe
from frappe import _

from frappe_books.accounting.money import as_decimal


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
