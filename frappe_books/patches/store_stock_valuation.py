import frappe

from frappe_books.inventory.valuation import DOCTYPE, KEY_FIELDS, restate_after


def execute():
	"""Store the running FIFO state on existing stock ledger entries."""
	for key in frappe.get_all(DOCTYPE, fields=KEY_FIELDS, distinct=True):
		restate_after(key, None)
