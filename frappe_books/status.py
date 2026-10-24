import frappe

from frappe_books.accounting.money import as_decimal

INVOICE_DOCTYPES = ("Books Sales Invoice", "Books Purchase Invoice")
# ERPNext's status of an invoice a submitted return points to, and of a submitted quote.
RETURN_ISSUED = {"Books Sales Invoice": "Credit Note Issued", "Books Purchase Invoice": "Debit Note Issued"}
SUBMITTED = {"Books Quotation": "Open"}


class StatusMixin:
	"""Store the list status of a submittable Books document."""

	def on_change(self):
		"""Store this document's status and, for a return, its original's; settling stores a paid invoice's."""
		store_status(self)
		if self.docstatus != 0 and self.get("return_against"):
			store_status(frappe.get_doc(self.doctype, self.return_against))


def get_status(doc) -> str:
	"""Return the list status of a submittable Books document."""
	if doc.docstatus == 0:
		return "Draft" if "Draft" in _status_options(doc) else "Saved"
	if doc.docstatus == 2:
		return "Cancelled"
	if doc.get("return_against"):
		return "Return"
	if _is_returned(doc):
		return RETURN_ISSUED.get(doc.doctype, "Return Issued")
	if doc.doctype in INVOICE_DOCTYPES:
		return _payment_status(doc)
	return SUBMITTED.get(doc.doctype, "Submitted")


def _status_options(doc):
	return (doc.meta.get_field("status").options or "").split("\n")


def _is_returned(doc) -> bool:
	"""An invoice has a submitted return against it; a stock transfer stores whether it has."""
	if doc.doctype in INVOICE_DOCTYPES:
		return bool(frappe.db.exists(doc.doctype, {"return_against": doc.name, "docstatus": 1}))
	return bool(doc.get("is_returned"))


def _payment_status(invoice) -> str:
	outstanding = as_decimal(invoice.outstanding_amount)
	if not outstanding:
		return "Paid"
	if outstanding == as_decimal(invoice.base_grand_total) - as_decimal(invoice.get("loyalty_amount")):
		return "Unpaid"
	return "Partly Paid"


def store_status(doc):
	# `db_set` would run `on_change` again.
	doc.status = get_status(doc)
	frappe.db.set_value(doc.doctype, doc.name, "status", doc.status, update_modified=False)
