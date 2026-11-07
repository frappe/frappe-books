import frappe
from frappe.query_builder import Case

from frappe_books.status import INVOICE_DOCTYPES


def execute():
	"""Clear return flags no submitted return backs, and show what partly returned invoices still owe."""
	for doctype in INVOICE_DOCTYPES:
		_clear_unbacked_return_flags(doctype)
		_refresh_return_issued_status(doctype)


def _clear_unbacked_return_flags(doctype):
	returned = set(
		frappe.get_all(
			doctype, filters={"docstatus": 1, "return_against": ["is", "set"]}, pluck="return_against"
		)
	)
	flagged = frappe.get_all(doctype, or_filters={"is_returned": 1, "is_fully_returned": 1}, pluck="name")
	if unbacked := [name for name in flagged if name not in returned]:
		frappe.db.set_value(
			doctype,
			{"name": ["in", unbacked]},
			{"is_returned": 0, "is_fully_returned": 0},
			update_modified=False,
		)


def _refresh_return_issued_status(doctype):
	"""Store the status `status.get_status` gives submitted invoices that show a return."""
	invoice = frappe.qb.DocType(doctype)
	settled = invoice.outstanding_amount == 0
	status = (
		Case()
		.when((invoice.is_fully_returned == 1) | ((invoice.is_returned == 1) & settled), "Return Issued")
		.when(settled, "Paid")
		.when(invoice.outstanding_amount == invoice.base_grand_total, "Unpaid")
		.else_("Partly Paid")
	)
	(
		frappe.qb.update(invoice)
		.set(invoice.status, status)
		.where(invoice.docstatus == 1)
		.where(invoice.status == "Return Issued")
		.where(invoice.return_against.isnull() | (invoice.return_against == ""))
		.run()
	)
