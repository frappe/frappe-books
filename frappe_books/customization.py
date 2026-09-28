"""Books form customizations, stored as Frappe Custom Fields."""

import frappe
from frappe import _

from frappe_books.ui_bridge.field_properties import get_docfield_properties
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
BOOKS_FIELD_TYPES = {fieldtype: books_fieldtype for books_fieldtype, fieldtype in FIELD_TYPE_MAP.items()}
# The row field that holds a Custom Field's options, by Books field type.
ROW_OPTIONS_FIELDS = {"Link": "target", "Table": "target", "DynamicLink": "references"}
PROTECTED_SCHEMAS = {
	"AccountingLedgerEntry",
	"CustomField",
	"CustomForm",
	"LoyaltyPointEntry",
	"SetupWizard",
	"StockLedgerEntry",
}
OPTION_FIELDTYPES = {"Select", "AutoComplete"}


def validate_custom_form(doc):
	if not frappe.db.get_single_value("Books Accounting Settings", "enable_form_customization"):
		frappe.throw(_("Enable form customization in Accounting Settings to customize forms."))
	if doc.name in PROTECTED_SCHEMAS or frappe.get_meta(target_doctype(doc.name)).issingle:
		frappe.throw(_("{0} cannot be customized.").format(doc.name))
	_validate_unique_fieldnames(doc.custom_fields)
	for row in doc.custom_fields:
		_validate_custom_field(doc.name, row)


def _validate_unique_fieldnames(rows):
	fieldnames = [row.fieldname for row in rows]
	duplicates = sorted({fieldname for fieldname in fieldnames if fieldnames.count(fieldname) > 1})
	if duplicates:
		frappe.throw(_("Custom field names must be unique: {0}").format(", ".join(duplicates)))


def _validate_custom_field(source_schema: str, row):
	if row.fieldname in schema_mapping()[source_schema]["fields"]:
		frappe.throw(f"Field {row.fieldname} already exists in Books schema {source_schema}")
	if row.is_required and not row.default:
		frappe.throw(_("Required custom field {0} needs a default value.").format(row.label))
	options = [option for option in (row.options or "").split("\n") if option.strip()]
	if row.fieldtype in OPTION_FIELDTYPES and len(options) < 2:
		frappe.throw(_("Custom field {0} needs at least two options.").format(row.label))


def get_saved_definition(source_schema: str, fieldname: str) -> dict:
	"""Return the row values of a custom field's saved Custom Field, or none before it is saved."""
	docfield = frappe.get_meta(target_doctype(source_schema)).get_field(custom_target_field(fieldname))
	if not docfield:
		return {}

	fieldtype = BOOKS_FIELD_TYPES.get(docfield.fieldtype, docfield.fieldtype)
	definition = {
		"label": docfield.label,
		"fieldtype": fieldtype,
		"is_required": docfield.reqd,
		"default": docfield.default,
		"options": None,
		"target": None,
		"references": None,
	}
	# Link, Table and Dynamic Link options take their /books names.
	options = get_docfield_properties(source_schema, docfield).get("options")
	definition[ROW_OPTIONS_FIELDS.get(fieldtype, "options")] = options
	return definition


def update_custom_fields(doc):
	"""Save each row's definition in its Custom Field and delete those of removed rows."""
	target = target_doctype(doc.name)
	for row in doc.custom_fields:
		_save_custom_field(target, _custom_field_values(doc.name, row, doc.custom_fields))
	_remove_stale_custom_fields(target, {custom_target_field(row.fieldname) for row in doc.custom_fields})
	frappe.clear_cache(doctype=target)


def remove_custom_fields(source_schema: str):
	target = target_doctype(source_schema)
	_remove_stale_custom_fields(target, set())
	frappe.clear_cache(doctype=target)


def _custom_field_values(source_schema: str, row, rows) -> dict:
	fieldtype = FIELD_TYPE_MAP.get(row.fieldtype, row.fieldtype)
	values = {
		"fieldname": custom_target_field(row.fieldname),
		"label": row.label,
		"fieldtype": fieldtype,
		"reqd": row.is_required,
		"default": row.default,
		"options": row.options,
		"is_system_generated": 1,
	}

	if fieldtype in {"Link", "Table"} and row.target:
		values["options"] = target_reference(row.target)
	elif fieldtype == "Dynamic Link" and row.references:
		values["options"] = _reference_target(source_schema, row.references, rows)

	return values


def _reference_target(source_schema: str, references: str, rows) -> str:
	if any(row.fieldname == references for row in rows):
		return custom_target_field(references)
	return target_field(source_schema, references)


def _save_custom_field(target: str, values: dict):
	if name := frappe.db.exists("Custom Field", {"dt": target, "fieldname": values["fieldname"]}):
		field = frappe.get_doc("Custom Field", name)
		field.update(values)
		field.save()
	else:
		frappe.get_doc({"doctype": "Custom Field", "dt": target, **values}).insert()


def _remove_stale_custom_fields(target: str, desired: set[str]):
	existing = frappe.get_all(
		"Custom Field",
		filters={"dt": target, "fieldname": ["like", f"{CUSTOM_FIELD_PREFIX}%"]},
		fields=["name", "fieldname"],
	)
	for field in existing:
		if field.fieldname not in desired:
			frappe.delete_doc("Custom Field", field.name)
