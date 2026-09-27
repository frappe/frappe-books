import frappe
from frappe.desk.form.linked_with import get_dynamic_linked_fields, get_linked_docs, get_linked_fields

from frappe_books.ui_bridge.mapping import source_by_doctype, target_doctype


def linked_entries(source_schema: str, name: str) -> dict[str, list[str]]:
	"""Return the Books documents that link to a document by schema, newest first, without cancelled ones."""
	doctype = target_doctype(source_schema)
	frappe.has_permission(doctype, doc=name, throw=True)
	entries = {}
	for linked_doctype, result in get_linked_docs(doctype, name, _link_info(doctype)).items():
		docs = sorted(
			(doc for doc in result["docs"] if doc.docstatus != 2), key=lambda doc: doc.creation, reverse=True
		)
		if docs:
			entries[source_by_doctype()[linked_doctype]] = [str(doc.name) for doc in docs]
	return entries


def _link_info(doctype):
	# `linked_with.get_linked_doctypes` caches whether dynamic links exist yet, so it misses later ones.
	links = {**get_linked_fields(doctype), **get_dynamic_linked_fields(doctype)}
	return {
		linked_doctype: {**context, "add_fields": ["creation"]}
		for linked_doctype, context in links.items()
		if linked_doctype in source_by_doctype()
	}
