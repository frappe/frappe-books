"""Books' UI settings, which every accessory mode user reads, whatever their ERPNext roles."""

import frappe
from frappe import _

from frappe_books.accessory import accessory_company
from frappe_books.permissions import has_app_permission

# Singles that hold how /books looks, not business data
UI_SETTINGS = ("Books System Settings", "Books Misc", "Books Print Settings")


@frappe.whitelist()
def get_ui_settings() -> dict:
	"""The UI settings by doctype, for accessory mode users who can open Books."""
	if not (accessory_company() and has_app_permission()):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	return {doctype: frappe.get_cached_doc(doctype).as_dict() for doctype in UI_SETTINGS}
