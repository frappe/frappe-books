import frappe

from frappe_books.coa import chart_options
from frappe_books.ui_bridge.mapping import is_searchable, schema_mapping, search_fields


def extend_bootinfo(bootinfo):
	"""Add what the Books app starts with to the session boot."""
	country = frappe.db.get_single_value("Books Accounting Settings", "country")
	bootinfo.books = {
		"country_code": {"India": "in", "Switzerland": "ch"}.get(country, "-"),
		"doctypes": {schema: config["doctype"] for schema, config in schema_mapping().items()},
		"search_fields": {
			schema: search_fields(schema) for schema in schema_mapping() if is_searchable(schema)
		},
		"charts_of_accounts": chart_options(),
	}
