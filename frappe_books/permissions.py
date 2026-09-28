import frappe

BOOKS_MODULE = "Frappe Books"


def has_app_permission() -> bool:
	"""Show and open Books for users who can read one of its doctypes."""
	readable = frappe.get_user().get_can_read()
	return bool(frappe.db.exists("DocType", {"module": BOOKS_MODULE, "name": ("in", readable)}))
