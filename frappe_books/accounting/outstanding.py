"""Outstanding-balance updates shared by invoices and payments."""

import frappe

from frappe_books.accounting.money import as_decimal, rounded


def update_party_outstanding(party_name):
	if not party_name or not frappe.db.exists("Books Party", party_name):
		return
	role = frappe.db.get_value("Books Party", party_name, "role")
	sales = _invoice_total("Books Sales Invoice", party_name)
	purchases = _invoice_total("Books Purchase Invoice", party_name)
	if role == "Customer":
		total = sales
	elif role == "Supplier":
		total = purchases
	else:
		total = sales - purchases
	frappe.db.set_value("Books Party", party_name, "outstanding_amount", rounded(total))


def _invoice_total(doctype, party_name):
	values = frappe.get_all(
		doctype,
		filters={"party": party_name, "docstatus": 1},
		pluck="outstanding_amount",
	)
	return sum((as_decimal(value) for value in values), as_decimal(0))
