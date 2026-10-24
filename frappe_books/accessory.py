"""Accessory mode: with ERPNext on the site, /books shows ERPNext documents instead of Books ones."""

import frappe
from frappe import _
from frappe.core.doctype.installed_applications.installed_applications import (
	get_setup_wizard_completed_apps,
)

SETTINGS = "Books ERPNext Settings"


def erpnext_installed() -> bool:
	return "erpnext" in frappe.get_installed_apps()


def erpnext_setup_complete() -> bool:
	return "erpnext" in get_setup_wizard_completed_apps()


def accessory_company() -> str | None:
	"""The ERPNext company /books shows in accessory mode, or None in standalone.

	ERPNext gone or the company deleted turns accessory mode off on the next load.
	"""
	if not erpnext_installed():
		return None

	accessory_mode, company = frappe.db.get_value(SETTINGS, None, ["accessory_mode", "default_company"])
	if accessory_mode and company and frappe.db.exists("Company", company):
		return company


def forbid_in_accessory_mode():
	"""Refuse a Books action that writes Books documents, as accessory mode makes none."""
	if accessory_company():
		frappe.throw(_("This is not available in accessory mode yet."))
