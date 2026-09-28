"""Translate Books interface schema names and fields to Frappe DocTypes."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import frappe
from frappe.utils.caching import request_cache

MAPPING_PATH = Path(__file__).resolve().parents[1] / "schema_mapping.json"
SOURCE_META_TO_TARGET = {
	"name": "name",
	"created": "creation",
	"createdBy": "owner",
	"modified": "modified",
	"modifiedBy": "modified_by",
	"idx": "idx",
	"parent": "parent",
	"parentFieldname": "parentfield",
	"parentSchemaName": "parenttype",
}
CUSTOM_FIELD_PREFIX = "custom_books_"


@lru_cache(maxsize=1)
def schema_mapping() -> dict[str, dict[str, Any]]:
	return json.loads(MAPPING_PATH.read_text())["doctypes"]


@lru_cache(maxsize=1)
def source_by_doctype() -> dict[str, str]:
	return {config["doctype"]: source for source, config in schema_mapping().items()}


def target_doctype(source_schema: str) -> str:
	config = schema_mapping().get(source_schema)
	if not config:
		frappe.throw(f"Unsupported Books schema: {source_schema}")
	return config["doctype"]


def target_field(source_schema: str, source_field: str) -> str:
	if source_field in SOURCE_META_TO_TARGET:
		return SOURCE_META_TO_TARGET[source_field]
	if source_field in {"submitted", "cancelled"}:
		return "docstatus"
	fields = schema_mapping()[source_schema]["fields"]
	if source_field in fields:
		return fields[source_field]

	custom_fields = custom_field_mapping(source_schema)
	if source_field in custom_fields:
		return custom_fields[source_field]

	frappe.throw(f"Unsupported field {source_field} for Books schema {source_schema}")


def source_field(source_schema: str, target_fieldname: str) -> str:
	for source_name, target_name in SOURCE_META_TO_TARGET.items():
		if target_name == target_fieldname:
			return source_name
	for source_name, target_name in schema_mapping()[source_schema]["fields"].items():
		if target_name == target_fieldname:
			return source_name
	for source_name, target_name in custom_field_mapping(source_schema).items():
		if target_name == target_fieldname:
			return source_name
	return target_fieldname


def search_fields(source_schema: str) -> list[str]:
	"""The fields Books search matches and shows: `name` and the DocType search fields, or only
	the search fields for table rows."""
	meta = frappe.get_meta(target_doctype(source_schema))
	fields = [
		source_field(source_schema, fieldname.strip())
		for fieldname in (meta.search_fields or "").split(",")
		if fieldname.strip()
	]
	return fields if meta.istable else ["name", *fields]


def is_searchable(source_schema: str) -> bool:
	"""Whether the search palette offers the schema: it has search fields or is found by name."""
	meta = frappe.get_meta(target_doctype(source_schema))
	return bool(meta.search_fields or (meta.show_name_in_global_search and not meta.istable))


def custom_field_mapping(source_schema: str) -> dict[str, str]:
	"""Return Books custom field names mapped to their hosted columns."""
	return custom_field_mappings().get(source_schema, {})


@request_cache
def custom_field_mappings() -> dict[str, dict[str, str]]:
	"""Map each customized Books schema to its custom field columns, in one query.

	Saving a custom form clears the doctype cache, which also clears this request cache.
	"""
	if not frappe.db.table_exists("Books Custom Field"):
		return {}

	rows = frappe.get_all(
		"Books Custom Field",
		filters={"parenttype": "Books Custom Form", "parentfield": "custom_fields"},
		fields=["parent", "fieldname"],
	)
	mappings: dict[str, dict[str, str]] = {}
	for row in rows:
		mappings.setdefault(row.parent, {})[row.fieldname] = custom_target_field(row.fieldname)
	return mappings


def custom_target_field(source_field: str) -> str:
	return f"{CUSTOM_FIELD_PREFIX}{frappe.scrub(source_field)}"


def target_reference(value: Any) -> Any:
	if isinstance(value, str) and value in schema_mapping():
		return schema_mapping()[value]["doctype"]
	return value


def source_reference(value: Any) -> Any:
	if isinstance(value, str):
		return source_by_doctype().get(value, value)
	return value
