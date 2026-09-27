import frappe

from frappe_books.inventory.invoice_balance import update_billed_status

INVOICE_DOCTYPES = ("Books Sales Invoice", "Books Purchase Invoice")


def execute():
	"""Flag transfers that invoices billed before the flag existed."""
	for doctype in INVOICE_DOCTYPES:
		invoices = frappe.get_all(
			doctype,
			filters={"docstatus": 1, "back_reference": ["is", "set"], "return_against": ["is", "not set"]},
			fields=["name", "back_reference"],
		)
		# One invoice per transfer is enough: the status is computed from all its invoices.
		for name in {row.back_reference: row.name for row in invoices}.values():
			update_billed_status(frappe.get_doc(doctype, name))
