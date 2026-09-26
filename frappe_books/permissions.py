import frappe

BOOKS_ROLES = {"Books User", "Books Manager", "System Manager"}


def has_app_permission() -> bool:
	"""Show and open Books only for users with a Books role."""
	return bool(BOOKS_ROLES.intersection(frappe.get_roles()))
