import frappe
from frappe.utils import flt

from frappe_books.accounting.money import as_decimal

INVOICE_DOCTYPES = ("Books Sales Invoice", "Books Purchase Invoice")
# ERPNext's status of a submitted delivery note or receipt that its invoices bill only in part.
PARTLY_BILLED = {"Books Delivery Note": "Partially Billed", "Books Purchase Receipt": "Partly Billed"}
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
	if doc.doctype in PARTLY_BILLED:
		return _billing_status(doc)
	if _is_returned(doc):
		return RETURN_ISSUED[doc.doctype]
	if doc.doctype in INVOICE_DOCTYPES:
		return _payment_status(doc)
	return SUBMITTED.get(doc.doctype, "Submitted")


def _status_options(doc):
	return (doc.meta.get_field("status").options or "").split("\n")


def _billing_status(transfer) -> str:
	"""ERPNext's status of a delivery note or receipt: fully returned, else how much of it is billed."""
	if flt(transfer.per_returned) >= 100:
		return "Return Issued"
	if flt(transfer.per_billed) >= 100:
		return "Completed"
	return PARTLY_BILLED[transfer.doctype] if flt(transfer.per_billed) else "To Bill"


def _is_returned(doc) -> bool:
	"""An invoice has a submitted return against it."""
	if doc.doctype not in INVOICE_DOCTYPES:
		return False
	return bool(frappe.db.exists(doc.doctype, {"return_against": doc.name, "docstatus": 1}))


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
