from frappe_books.setup import grant_core_permissions


def execute():
	"""Give the new Books Cashier role its rights on core doctypes."""
	grant_core_permissions("Books Cashier")
