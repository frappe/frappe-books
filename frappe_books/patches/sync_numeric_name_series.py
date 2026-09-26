import frappe
from frappe.model.naming import NamingSeries

NUMERIC_NAME_DOCTYPES = ("Books Item Enquiry", "Books Ledger Entry", "Books Stock Ledger Entry")


def execute():
	"""Move the shared numeric name counter past names written by the old client."""
	series = NamingSeries(".##########")
	highest = max(_highest_numeric_name(doctype) for doctype in NUMERIC_NAME_DOCTYPES)
	if highest > series.get_current_value():
		series.update_counter(highest)


def _highest_numeric_name(doctype):
	names = frappe.get_all(doctype, pluck="name")
	return max((int(name) for name in map(str, names) if name.isdigit()), default=0)
