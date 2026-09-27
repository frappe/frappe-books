"""Persist Books form customizations in hosted Frappe DocTypes."""

import frappe
from frappe import _
from frappe.utils import now

from frappe_books.ui_bridge.database import PROTECTED_WRITE_SCHEMAS
from frappe_books.ui_bridge.mapping import (
	CUSTOM_FIELD_PREFIX,
	custom_target_field,
	schema_mapping,
	target_doctype,
	target_field,
	target_reference,
)

FIELD_TYPE_MAP = {
	"AttachImage": "Attach Image",
	"Attachment": "Attach",
	"AutoComplete": "Autocomplete",
	"DynamicLink": "Dynamic Link",
}
PROTECTED_SCHEMAS = {*PROTECTED_WRITE_SCHEMAS, "CustomField", "CustomForm", "SetupWizard"}


def validate_custom_form(doc):
	if not frappe.db.get_single_value("Books Accounting Settings", "enable_form_customization"):
		frappe.throw(_("Enable form customization in Accounting Settings to customize forms."))
	if doc.name in PROTECTED_SCHEMAS or frappe.get_meta(target_doctype(doc.name)).issingle:
		frappe.throw(_("{0} cannot be customized.").format(doc.name))


def sync_all_custom_forms():
	for name in frappe.get_all("Books Custom Form", pluck="name"):
		sync_custom_form(frappe.get_doc("Books Custom Form", name))


def sync_custom_form(doc):
	"""Create hosted columns for one Books Custom Form document."""
	target = target_doctype(doc.name)
	definitions = [_custom_field_definition(doc.name, row, doc.custom_fields) for row in doc.custom_fields]

	for definition in definitions:
		_upsert_custom_field(target, definition, doc.owner)
	_remove_stale_custom_fields(target, {field["fieldname"] for field in definitions})
	frappe.clear_cache(doctype=target)


def remove_custom_fields(source_schema: str):
	target = target_doctype(source_schema)
	_remove_stale_custom_fields(target, set())
	frappe.clear_cache(doctype=target)


def _custom_field_definition(source_schema: str, row, rows) -> dict:
	if row.fieldname in schema_mapping()[source_schema]["fields"]:
		frappe.throw(f"Field {row.fieldname} already exists in Books schema {source_schema}")

	fieldtype = FIELD_TYPE_MAP.get(row.fieldtype, row.fieldtype)
	definition = {
		"fieldname": custom_target_field(row.fieldname),
		"label": row.label,
		"fieldtype": fieldtype,
		# Existing rows have no value yet, so a column is only required when a default can fill it.
		"reqd": bool(row.is_required and row.default is not None),
		"default": row.default,
		"is_system_generated": 1,
	}

	if fieldtype in {"Link", "Table"} and row.target:
		definition["options"] = target_reference(row.target)
	elif fieldtype == "Dynamic Link" and row.references:
		definition["options"] = _reference_target(source_schema, row.references, rows)
	elif row.options:
		definition["options"] = row.options

	return definition


def _reference_target(source_schema: str, references: str, rows) -> str:
	if any(row.fieldname == references for row in rows):
		return custom_target_field(references)
	return target_field(source_schema, references)


def _upsert_custom_field(target: str, definition: dict, owner: str):
	name = frappe.db.exists("Custom Field", {"dt": target, "fieldname": definition["fieldname"]})
	if name:
		field = frappe.get_doc("Custom Field", name)
		field.update(definition)
		field.save()
		return

	# A request always stores the user saving the form. A migrate keeps a given owner and
	# creation, so its fields belong to the form owner instead of Administrator, who alone
	# could remove them.
	field = {"doctype": "Custom Field", "dt": target, "owner": owner, "creation": now(), **definition}
	frappe.get_doc(field).insert()


def _remove_stale_custom_fields(target: str, desired: set[str]):
	existing = frappe.get_all(
		"Custom Field",
		filters={"dt": target, "fieldname": ["like", f"{CUSTOM_FIELD_PREFIX}%"]},
		fields=["name", "fieldname"],
	)
	for field in existing:
		if field.fieldname not in desired:
			frappe.delete_doc("Custom Field", field.name)
