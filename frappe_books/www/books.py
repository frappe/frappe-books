import frappe
from frappe import _
from frappe.www import desk

from frappe_books.permissions import has_app_permission

no_cache = 1


def get_context(context):
	"""Serve the Books app with the desk's session boot; `boot.books` comes from `extend_bootinfo`."""
	if frappe.session.user != "Guest" and not has_app_permission():
		frappe.throw(_("You are not permitted to access this page."), frappe.PermissionError)
	return desk.get_context(context)
