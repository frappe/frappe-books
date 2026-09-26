import frappe
from frappe.utils import cint


def execute():
	"""Keep Books Accounting Settings.setup_complete as the only setup flag."""
	if cint(frappe.db.get_singles_dict("Books Setup Wizard").get("completed")):
		frappe.db.set_single_value("Books Accounting Settings", "setup_complete", 1)
	frappe.db.delete("Singles", {"doctype": "Books Setup Wizard", "field": "completed"})
