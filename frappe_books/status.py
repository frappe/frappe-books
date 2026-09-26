import frappe

from frappe_books.accounting.money import as_decimal

INVOICE_DOCTYPES = ("Books Sales Invoice", "Books Purchase Invoice")


def get_status(doc) -> str:
	"""Return the list status of a submittable Books document."""
	if doc.docstatus == 0:
		return "Saved"
	if doc.docstatus == 2:
		return "Cancelled"
	if doc.get("return_against"):
		return "Return"
	if doc.get("is_returned"):
		return "ReturnIssued"
	if doc.doctype in INVOICE_DOCTYPES:
		return _payment_status(doc)
	return "Submitted"


def _payment_status(invoice) -> str:
	outstanding = as_decimal(invoice.outstanding_amount)
	if not outstanding:
		return "Paid"
	if outstanding == as_decimal(invoice.base_grand_total):
		return "Unpaid"
	return "PartlyPaid"


def on_change(doc, method=None):
	"""Store the status of a saved, submitted or cancelled document and of the documents it settles."""
	store_status(doc)
	if doc.docstatus == 0:
		return
	if doc.get("return_against"):
		store_status(frappe.get_doc(doc.doctype, doc.return_against))
	for row in doc.get("payment_references") or []:
		store_status(frappe.get_doc(row.reference_type, row.reference_name))


def store_status(doc):
	# `db_set` would run `on_change` again.
	doc.status = get_status(doc)
	frappe.db.set_value(doc.doctype, doc.name, "status", doc.status, update_modified=False)
