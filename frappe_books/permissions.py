import frappe

from frappe_books.accessory import accessory_company

BOOKS_MODULE = "Frappe Books"
# The ERPNext modules of the doctypes /books shows in accessory mode
ERPNEXT_MODULES = ("Accounts", "Selling", "Buying", "Stock", "Setup")
# Every user reads the field picks forms show, so reading them opens Books for no one.
EVERY_USER_DOCTYPES = ("Books Field Pick",)


def has_app_permission() -> bool:
	"""Show and open Books for users who can read one of the doctypes it shows in its mode."""
	modules = ERPNEXT_MODULES if accessory_company() else (BOOKS_MODULE,)
	readable = set(frappe.get_user().get_can_read()) - set(EVERY_USER_DOCTYPES)
	return bool(frappe.db.exists("DocType", {"module": ("in", modules), "name": ("in", list(readable))}))


def check_preview_permission(doc) -> None:
	"""A preview shows what a save would store, so it needs the right to make or edit `doc`."""
	if doc.is_new():
		doc.check_permission("create")
	else:
		frappe.has_permission(doc.doctype, "write", doc=doc.name, throw=True)
