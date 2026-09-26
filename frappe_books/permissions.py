import frappe

from frappe_books.ui_bridge.mapping import schema_mapping

BOOKS_ROLES = {"Books User", "Books Manager", "System Manager"}
PERMISSION_TYPES = ("read", "write", "create", "delete", "submit", "cancel")


def has_app_permission() -> bool:
	"""Show and open Books only for users with a Books role."""
	return bool(BOOKS_ROLES.intersection(frappe.get_roles()))


def get_schema_permissions() -> dict[str, list[str]]:
	"""Map each Books schema to the permission types the current user has on its doctype."""
	return {
		schema: [ptype for ptype in PERMISSION_TYPES if frappe.has_permission(config["doctype"], ptype)]
		for schema, config in schema_mapping().items()
		if not frappe.get_meta(config["doctype"]).istable
	}
