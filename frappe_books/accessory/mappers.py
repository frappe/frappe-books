"""Create actions on ERPNext documents: ERPNext's own mappers, by the Books mapper they replace."""

import frappe
from frappe import _
from frappe.model.document import Document


def _mapper(path: str):
	"""An ERPNext mapper that takes the source document's name."""
	return lambda doctype, name: frappe.get_attr(path)(name)


def _payment(doctype: str, name: str) -> Document:
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	return get_payment_entry(doctype, name)


def _new_doc(target: str, values):
	"""A new `target` with `values(source name)`, where ERPNext has no mapper, e.g. a customer's invoice."""
	return lambda doctype, name: frappe.new_doc(target, **values(name))


# By source doctype and the Books mapper a Create action names.
MAPPERS = {
	("Quotation", "make_sales_invoice"): _mapper(
		"erpnext.selling.doctype.quotation.mapper.make_sales_invoice"
	),
	("Sales Invoice", "make_delivery_note"): _mapper(
		"erpnext.accounts.doctype.sales_invoice.mapper.make_delivery_note"
	),
	("Sales Invoice", "make_return"): _mapper(
		"erpnext.accounts.doctype.sales_invoice.mapper.make_sales_return"
	),
	("Sales Invoice", "make_payment"): _payment,
	("Purchase Invoice", "make_purchase_receipt"): _mapper(
		"erpnext.accounts.doctype.purchase_invoice.mapper.make_purchase_receipt"
	),
	("Purchase Invoice", "make_return"): _mapper(
		"erpnext.accounts.doctype.purchase_invoice.mapper.make_debit_note"
	),
	("Purchase Invoice", "make_payment"): _payment,
	("Delivery Note", "make_sales_invoice"): _mapper(
		"erpnext.stock.doctype.delivery_note.mapper.make_sales_invoice"
	),
	("Delivery Note", "make_return"): _mapper("erpnext.stock.doctype.delivery_note.mapper.make_sales_return"),
	("Purchase Receipt", "make_purchase_invoice"): _mapper(
		"erpnext.stock.doctype.purchase_receipt.mapper.make_purchase_invoice"
	),
	("Purchase Receipt", "make_return"): _mapper(
		"erpnext.stock.doctype.purchase_receipt.mapper.make_purchase_return"
	),
	("Lead", "make_customer"): _mapper("erpnext.crm.doctype.lead.mapper.make_customer"),
	("Lead", "make_quotation"): _mapper("erpnext.crm.doctype.lead.mapper.make_quotation"),
	("Customer", "make_sales_invoice"): _new_doc("Sales Invoice", lambda name: {"customer": name}),
	("Supplier", "make_purchase_invoice"): _new_doc("Purchase Invoice", lambda name: {"supplier": name}),
	("Item", "make_sales_invoice"): _new_doc("Sales Invoice", lambda name: {"items": [{"item_code": name}]}),
	("Item", "make_purchase_invoice"): _new_doc(
		"Purchase Invoice", lambda name: {"items": [{"item_code": name}]}
	),
}


@frappe.whitelist()
def make_mapped_doc(source_doctype: str, source_name: str, mapper: str) -> dict:
	"""The unsaved document ERPNext builds from `source_name` for a Books Create action, like an invoice's payment.

	It needs the right to read the source and to create the new document.
	"""
	make = MAPPERS.get((source_doctype, mapper))
	if not make:
		frappe.throw(_("This is not available in accessory mode yet."))

	frappe.has_permission(source_doctype, "read", doc=source_name, throw=True)
	document = make(source_doctype, source_name)
	frappe.has_permission(document.doctype, "create", throw=True)
	return document.as_dict()
