from frappe.permissions import update_permission_property


def execute():
	"""Print Format Jinja can read any table, so Books Manager no longer writes print formats."""
	for right in ("write", "create", "delete"):
		update_permission_property("Print Format", "Books Manager", 0, right, 0)
