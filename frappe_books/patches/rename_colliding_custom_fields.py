import frappe

from frappe_books.ui_bridge.mapping import custom_target_field, schema_mapping, target_doctype


def execute():
	"""Rename Books custom fields that a standard field of the same name now replaces."""
	rows = frappe.get_all(
		"Books Custom Field",
		filters={"parenttype": "Books Custom Form"},
		fields=["name", "parent", "fieldname"],
	)
	for row in rows:
		if row.fieldname in schema_mapping()[row.parent]["fields"]:
			rename_custom_field(row, f"custom{row.fieldname[0].upper()}{row.fieldname[1:]}")


def rename_custom_field(row, fieldname: str):
	doctype = target_doctype(row.parent)
	old_column, new_column = custom_target_field(row.fieldname), custom_target_field(fieldname)
	if frappe.db.has_column(doctype, old_column):
		frappe.db.rename_column(doctype, old_column, new_column)
	frappe.db.set_value("Custom Field", {"dt": doctype, "fieldname": old_column}, "fieldname", new_column)
	frappe.db.set_value(
		"Books Custom Field", {"parent": row.parent, "references": row.fieldname}, "references", fieldname
	)
	frappe.db.set_value("Books Custom Field", row.name, "fieldname", fieldname)
	frappe.clear_cache(doctype=doctype)
