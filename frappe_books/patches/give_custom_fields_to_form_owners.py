import frappe

from frappe_books.ui_bridge.mapping import CUSTOM_FIELD_PREFIX, target_doctype


def execute():
	"""Let System Managers remove Books custom fields that a migrate created as Administrator."""
	for form in frappe.get_all("Books Custom Form", fields=["name", "owner"]):
		filters = {
			"dt": target_doctype(form.name),
			"fieldname": ["like", f"{CUSTOM_FIELD_PREFIX}%"],
			"owner": "Administrator",
		}
		frappe.db.set_value("Custom Field", filters, "owner", form.owner, update_modified=False)
