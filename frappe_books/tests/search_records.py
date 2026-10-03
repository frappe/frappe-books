import frappe

from frappe_books.search import BooksSearch


def index_search_records(doctype: str, names: list[str]):
	"""Index records for the browser search tests now, not at Frappe's next five-minutely run."""
	if not frappe.conf.allow_tests:
		frappe.throw("Search records need a test site")
	BooksSearch().index_documents_by_name(doctype, names)
