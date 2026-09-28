import frappe

from frappe_books.coa import chart_options
from frappe_books.ui_bridge.mapping import schema_mapping


def extend_bootinfo(bootinfo):
	"""Add what the Books app starts with to the session boot."""
	country = frappe.db.get_single_value("Books Accounting Settings", "country")
	bootinfo.books = {
		"country_code": {"India": "in", "Switzerland": "ch"}.get(country, "-"),
		"doctypes": {schema: config["doctype"] for schema, config in schema_mapping().items()},
		"charts_of_accounts": chart_options(),
	}
