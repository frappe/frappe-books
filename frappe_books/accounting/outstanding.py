"""Outstanding-balance updates shared by invoices and payments."""

import frappe

from frappe_books.accounting.money import as_decimal, rounded


def update_party_outstanding(party_name):
	role = party_name and frappe.db.get_value("Books Party", party_name, "role")
	if not role:
		return
	if role == "Customer":
		total = _invoice_total("Books Sales Invoice", party_name)
	elif role == "Supplier":
		total = _invoice_total("Books Purchase Invoice", party_name)
	else:
		total = _invoice_total("Books Sales Invoice", party_name) - _invoice_total(
			"Books Purchase Invoice", party_name
		)
	frappe.db.set_value("Books Party", party_name, "outstanding_amount", rounded(total))


def _invoice_total(doctype, party_name):
	rows = frappe.get_all(
		doctype,
		filters={"party": party_name, "docstatus": 1},
		fields=[{"SUM": "outstanding_amount", "as": "total"}],
	)
	return as_decimal(rows[0].total)
