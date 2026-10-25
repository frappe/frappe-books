import frappe
from frappe.utils.jinja_globals import bundled_asset

from frappe_books.accessory import (
	accessory_company,
	erpnext_installed,
	erpnext_setup_complete,
	start_in_accessory_mode,
)
from frappe_books.coa import chart_options
from frappe_books.company import default_company
from frappe_books.regional import INDIAN_STATES
from frappe_books.settings import regional_code


def extend_bootinfo(bootinfo):
	"""Add what the Books app starts with to the session boot."""
	start_in_accessory_mode()
	company = accessory_company()
	bootinfo.books = {
		"country_code": regional_code(),
		# The ERPNext company in accessory mode, else the one Books Company
		"company": company or default_company(),
		"accessory_mode": bool(company),
		# Forms name the company their per-company values are for when ERPNext has others
		"other_companies": bool(company) and frappe.db.count("Company") > 1,
		"erpnext": erpnext_state(),
		"charts_of_accounts": chart_options(),
		"indian_states": INDIAN_STATES,
		# The stylesheet Frappe prints with, for print previews in /books
		"print_style": bundled_asset("print.bundle.css"),
	}


def erpnext_state() -> dict | None:
	"""What the settings' ERPNext section shows, or None without ERPNext."""
	if erpnext_installed():
		return {"setup_complete": erpnext_setup_complete()}
