import frappe

from frappe_books.frappe_books.doctype.books_accounting_settings.books_accounting_settings import (
	DEPENDENT_SWITCHES,
)


def execute():
	"""Turn off switches whose needed switch is off, e.g. Coupon Code left on without Pricing Rule."""
	for fieldname, needed in DEPENDENT_SWITCHES.items():
		if not frappe.db.get_single_value("Books Accounting Settings", needed):
			frappe.db.set_single_value("Books Accounting Settings", fieldname, 0)
