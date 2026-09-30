"""Install and test bootstrap data for Frappe Books."""

import frappe
from frappe.desk.page.setup_wizard.setup_wizard import complete_app_setup
from frappe.permissions import add_permission, update_permission_property

from frappe_books.printing import default_print_format, set_default_print_format
from frappe_books.series import NUMBER_SERIES

DEFAULT_SERIES_START = 1001
DEFAULT_PRINT_FORMATS = {
	"Books Sales Quote": "Business - Quote",
	"Books Sales Invoice": "Business - Sales Invoice",
	"Books Purchase Invoice": "Business - Purchase Invoice",
	"Books Payment": "Business - Payment",
	"Books Shipment": "Business - Shipment",
}
POS_PRINT_FORMAT = "Business-POS - Sales Invoice"
DEFAULT_UOMS = {"Unit": 1, "Kg": 0, "Gram": 0, "Meter": 0, "Hour": 0, "Day": 0}
# Rights Books roles need on core doctypes the Books interface uses; if_owner limits them to own records
CORE_PERMISSIONS = {
	"Currency": {
		"Books User": ("read", "report", "print", "export", "email"),
		"Books Manager": ("read", "write", "create", "delete", "report", "print", "export", "email", "share"),
	},
	"Data Import": {
		"Books Manager": ("read", "write", "create", "if_owner"),
	},
	"Print Format": {
		"Books User": ("read", "print"),
		"Books Manager": ("read", "write", "create", "delete", "print"),
	},
}


def bootstrap():
	"""Seed the records every Books site needs. Runs after install and before tests."""
	for prefix, reference_type, _field in NUMBER_SERIES.values():
		values = {"start": DEFAULT_SERIES_START, "pad_zeros": 4, "reference_type": reference_type}
		_insert_if_missing("Books Number Series", prefix, values)
	for name, is_whole in DEFAULT_UOMS.items():
		_insert_if_missing("Books Uom", name, {"is_whole": is_whole})
	_insert_if_missing("Books Location", "Stores", {})
	for method_type in ("Cash", "Bank"):
		_insert_if_missing("Books Payment Method", method_type, {"type": method_type})
	grant_core_permissions()
	set_default_print_formats()


def before_tests():
	"""Tests run on a site Frappe has set up for an Indian company."""
	bootstrap()
	if not frappe.is_setup_complete():
		complete_app_setup(country="India", currency="INR", timezone="Asia/Kolkata")


def grant_core_permissions():
	"""Grant Books roles rights on core doctypes, as the Role Permission Manager does."""
	for doctype, roles in CORE_PERMISSIONS.items():
		for role, rights in roles.items():
			if not frappe.db.exists("Custom DocPerm", {"parent": doctype, "role": role, "permlevel": 0}):
				add_permission(doctype, role)
			for right in rights:
				update_permission_property(doctype, role, 0, right, 1)


def set_default_print_formats():
	"""Give each Books DocType and the POS a built-in print format, unless one is chosen."""
	for doctype, print_format in DEFAULT_PRINT_FORMATS.items():
		if not default_print_format(doctype):
			set_default_print_format(doctype, print_format)
	if not frappe.db.get_single_value("Books Defaults", "pos_print_template"):
		frappe.db.set_single_value("Books Defaults", "pos_print_template", POS_PRINT_FORMAT)


def _insert_if_missing(doctype, name, values):
	if frappe.db.exists(doctype, name):
		return
	frappe.get_doc({"doctype": doctype, "name": name, **values}).insert(ignore_permissions=True)
