from collections import defaultdict

import frappe
from frappe.utils import create_batch

from frappe_books.status import get_status

STATUS_FIELDS = ("return_against", "is_returned", "outstanding_amount", "base_grand_total")
# SQLite allows 32766 query parameters.
BATCH_SIZE = 1000


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
		for batch in create_batch(names, BATCH_SIZE):
			frappe.db.set_value(doctype, {"name": ["in", batch]}, "status", status, update_modified=False)
