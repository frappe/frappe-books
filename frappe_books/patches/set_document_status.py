from collections import defaultdict

import frappe

from frappe_books.status import get_status

STATUS_FIELDS = ("return_against", "is_returned", "outstanding_amount", "base_grand_total")


def execute():
	"""Store the list status of existing submittable documents."""
	for doctype in frappe.get_hooks("doc_events", app_name="frappe_books"):
		_set_statuses(doctype)


def _set_statuses(doctype):
	meta = frappe.get_meta(doctype)
	fields = ["name", "docstatus", *(field for field in STATUS_FIELDS if meta.has_field(field))]
	names_by_status = defaultdict(list)
	for row in frappe.get_all(doctype, fields=fields):
		row.doctype = doctype
		names_by_status[get_status(row)].append(row.name)
	for status, names in names_by_status.items():
		frappe.db.set_value(doctype, {"name": ["in", names]}, "status", status, update_modified=False)
