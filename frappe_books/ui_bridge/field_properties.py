from __future__ import annotations

from typing import Any

import frappe
from frappe.model import table_fields

from frappe_books.series import NUMBER_SERIES
from frappe_books.ui_bridge.mapping import (
	custom_field_mapping,
	schema_mapping,
	source_field,
	source_reference,
	target_doctype,
)

DATA_PROPERTIES = ("fieldtype", "options", "reqd", "default", "read_only", "set_only_once", "non_negative")


def get_field_properties() -> dict[str, dict[str, dict[str, Any]]]:
	"""Map each Books schema the user can read to the data properties of its fields.

	Meta includes Customize Form property setters and custom fields, so the Books app shows what
	the server enforces.
	"""
	return {schema: get_schema_field_properties(schema) for schema in get_readable_schemas()}


def get_readable_schemas() -> list[str]:
	"""Return the schemas the user can read, with the child tables they hold."""
	parents = [
		schema
		for schema, config in schema_mapping().items()
		if not frappe.get_meta(config["doctype"]).istable and frappe.has_permission(config["doctype"], "read")
	]
	children = {
		source_reference(field.options)
		for schema in parents
		for field in frappe.get_meta(target_doctype(schema)).get_table_fields()
	}
	return [*parents, *sorted(children & schema_mapping().keys())]


def get_schema_field_properties(schema: str) -> dict[str, dict[str, Any]]:
	meta = frappe.get_meta(target_doctype(schema))
	fieldnames = {**schema_mapping()[schema]["fields"], **custom_field_mapping(schema)}
	properties = {}
	for source, target in fieldnames.items():
		if docfield := meta.get_field(target):
			properties[source] = get_docfield_properties(schema, docfield)
	if "status" in properties and meta.states:
		# Frappe colours a document's `status` by the DocType state of the same title.
		properties["status"]["states"] = {state.title: state.color for state in meta.states}
	return properties


def get_docfield_properties(schema: str, docfield) -> dict[str, Any]:
	"""Return the set data properties of one field, naming linked doctypes and fields as Books does."""
	properties = {key: docfield.get(key) for key in DATA_PROPERTIES if docfield.get(key)}
	if docfield.fieldtype == "Link" or docfield.fieldtype in table_fields:
		properties["options"] = source_reference(docfield.options)
	elif docfield.fieldtype == "Dynamic Link":
		properties["options"] = source_field(schema, docfield.options)

	if docfield.options == "DocType" and docfield.default:
		properties["default"] = source_reference(docfield.default)
	elif docfield.fieldname == "number_series" and target_doctype(schema) in NUMBER_SERIES:
		# A JSON default would stop inserts from falling back to the series set in Books Defaults.
		properties["default"] = NUMBER_SERIES[target_doctype(schema)][0]
	return properties
