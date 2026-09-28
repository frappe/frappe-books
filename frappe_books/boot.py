from frappe_books.coa import chart_options, standard_account_labels
from frappe_books.regional import INDIAN_STATES
from frappe_books.settings import regional_code
from frappe_books.ui_bridge.mapping import is_searchable, schema_mapping, search_fields


def extend_bootinfo(bootinfo):
	"""Add what the Books app starts with to the session boot."""
	bootinfo.books = {
		"country_code": regional_code(),
		"doctypes": {schema: config["doctype"] for schema, config in schema_mapping().items()},
		"search_fields": {
			schema: search_fields(schema) for schema in schema_mapping() if is_searchable(schema)
		},
		"charts_of_accounts": chart_options(),
		"account_labels": standard_account_labels(),
		"indian_states": INDIAN_STATES,
	}
