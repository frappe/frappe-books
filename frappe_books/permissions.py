import frappe

BOOKS_MODULE = "Frappe Books"
# Roles that sell outside the POS; a Books Cashier without one sells only through it.
SELLING_ROLES = ("Books User", "Books Manager", "System Manager")


def has_app_permission() -> bool:
	"""Show and open Books for users who can read one of its doctypes."""
	readable = frappe.get_user().get_can_read()
	return bool(frappe.db.exists("DocType", {"module": BOOKS_MODULE, "name": ("in", readable)}))


def check_preview_permission(doc) -> None:
	"""A preview shows what a save would store, so it needs the right to make or edit `doc`."""
	if doc.is_new():
		doc.check_permission("create")
	else:
		frappe.has_permission(doc.doctype, "write", doc=doc.name, throw=True)


def sells_only_at_pos(user=None) -> bool:
	"""Books Cashiers sell, and take returns, only through the POS."""
	roles = frappe.get_roles(user)
	return "Books Cashier" in roles and not any(role in roles for role in SELLING_ROLES)
