from collections import defaultdict

import frappe

from frappe_books.ui_bridge.mapping import source_by_doctype, target_doctype

LINKED_ENTRIES_LIMIT = 100


def linked_entries(source_schema: str, name: str) -> dict[str, list[str]]:
	"""Return the Books documents that link to a document by schema, newest first, without cancelled ones."""
	doctype = target_doctype(source_schema)
	frappe.has_permission(doctype, doc=name, throw=True)
	creation_by_doctype = defaultdict(dict)
	for linked_doctype, filters, or_filters in _link_queries(doctype, name):
		for row in _linked_rows(linked_doctype, filters, or_filters):
			creation_by_doctype[linked_doctype][row.name] = row.creation
	return {
		source_by_doctype()[linked_doctype]: _newest(creation_by_name)
		for linked_doctype, creation_by_name in creation_by_doctype.items()
	}


def _link_queries(doctype: str, name: str):
	"""Yield (linked doctype, filters, or_filters) for each way a Books document can link to `name`."""
	for meta in _document_metas():
		link_filters = []
		for table_meta in (meta, *(frappe.get_meta(field.options) for field in meta.get_table_fields())):
			link_filters += [
				[table_meta.name, field.fieldname, "=", name]
				for field in table_meta.get("fields", {"fieldtype": "Link", "options": doctype})
			]
			for field in table_meta.get("fields", {"fieldtype": "Dynamic Link"}):
				type_filter = [table_meta.name, field.options, "=", doctype]
				yield meta.name, [type_filter, [table_meta.name, field.fieldname, "=", name]], []
		if link_filters:
			yield meta.name, [], link_filters


def _document_metas():
	for doctype in source_by_doctype():
		meta = frappe.get_meta(doctype)
		if not (meta.istable or meta.issingle):
			yield meta


def _linked_rows(doctype: str, filters: list, or_filters: list) -> list:
	if not frappe.has_permission(doctype):
		return []
	return frappe.get_list(
		doctype,
		filters=[*filters, [doctype, "docstatus", "!=", 2]],
		or_filters=or_filters,
		fields=["name", "creation"],
		order_by="creation desc",
		limit=LINKED_ENTRIES_LIMIT,
		distinct=True,
	)


def _newest(creation_by_name: dict) -> list[str]:
	names = sorted(creation_by_name, key=creation_by_name.get, reverse=True)
	return [str(name) for name in names[:LINKED_ENTRIES_LIMIT]]
