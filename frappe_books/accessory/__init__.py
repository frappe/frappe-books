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
	if not (erpnext_installed() and frappe.db.get_single_value(SETTINGS, "accessory_mode")):
		return None

	company = frappe.db.get_single_value(SETTINGS, "default_company")
	if company and frappe.db.exists("Company", company):
		return company


def forbid_in_accessory_mode():
	"""Refuse a Books action that writes Books documents, as accessory mode makes none."""
	if accessory_company():
		frappe.throw(_("This is not available in accessory mode yet."))


def start_in_accessory_mode():
	"""Turn accessory mode on, once, on a site whose ERPNext is set up and whose Books never was.

	Turning it off later saves the settings, so Books' own setup wizard shows for standalone data.
	"""
	if frappe.flags.read_only or not _starts_in_accessory_mode():
		return

	company = erpnext_default_company()
	if not company:
		return

	settings = frappe.get_single(SETTINGS)
	settings.update({"default_company": company, "accessory_mode": 1})
	settings.save(ignore_permissions=True)
	# The boot runs in GET requests too, which Frappe commits only when asked, as its own boot does.
	frappe.local.flags.commit = True


def _starts_in_accessory_mode() -> bool:
	return (
		erpnext_installed()
		and erpnext_setup_complete()
		and not frappe.db.get_single_value("Books Accounting Settings", "setup_complete")
		# Saved settings, even with accessory mode off, are someone's choice.
		and "modified" not in frappe.db.get_singles_dict(SETTINGS)
	)


def erpnext_default_company() -> str | None:
	"""ERPNext's default company, or its only company."""
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if company:
		return company

	companies = frappe.get_all("Company", pluck="name", limit=2)
	if len(companies) == 1:
		return companies[0]
