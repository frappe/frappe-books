"""Books form customizations, stored as Frappe Custom Fields."""

import re
import unicodedata

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
# The row field a field type needs, as the /books form asks for it.
REQUIRED_ROW_FIELDS = {"Link": "target", "Table": "target", "DynamicLink": "references"}

# A word as lodash's `words` finds it, after `deburr`: /books named custom fields with `camelCase`.
_BREAKS = r"\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\xbf\xd7\xf7\u2000-\u206f\s\ufeff\u180e"
_UPPERS = r"A-Z\xc0-\xd6\xd8-\xde"
_LOWERS = r"a-z\xdf-\xf6\xf8-\xff"
_BREAK = f"[{_BREAKS}]"
_UPPER = f"[{_UPPERS}]"
_LOWER = f"[{_LOWERS}]"
_MISC_UPPER = f"[^{_BREAKS}0-9\u2700-\u27bf{_LOWERS}]"
_MISC_LOWER = f"[^{_BREAKS}0-9\u2700-\u27bf{_UPPERS}]"
_WORD = re.compile(
	rf"{_UPPER}?{_LOWER}+(?={_BREAK}|{_UPPER}|$)"
	rf"|{_MISC_UPPER}+(?={_BREAK}|{_UPPER}{_MISC_LOWER}|$)"
	rf"|{_UPPER}?{_MISC_LOWER}+"
	rf"|{_UPPER}+"
	r"|[0-9]*(?:1ST|2ND|3RD|(?![123])[0-9]TH)(?=\b|[a-z_])"
	r"|[0-9]*(?:1st|2nd|3rd|(?![123])[0-9]th)(?=\b|[A-Z_])"
	r"|[0-9]+"
)
_COMBINING_MARKS = re.compile("[\u0300-\u036f\ufe20-\ufe2f\u20d0-\u20ff]")
# Latin letters that do not decompose into a base letter and marks.
_DEBURRED = {
	"Æ": "Ae", "æ": "ae", "Ø": "O", "ø": "o", "Ð": "D", "ð": "d", "Þ": "Th", "þ": "th", "ß": "ss",
	"Đ": "D", "đ": "d", "Ħ": "H", "ħ": "h", "\u0131": "i", "Ĳ": "IJ", "ĳ": "ij", "Ŀ": "L", "ŀ": "l",
	"Ł": "L", "ł": "l", "ŉ": "'n", "Ŋ": "N", "ŋ": "n", "Œ": "Oe", "œ": "oe", "Ŧ": "T", "ŧ": "t",
	"\u017f": "s",
}  # fmt: skip


def camel_case(label: str) -> str:
	"""The fieldname /books suggests for a label, as lodash's `camelCase` makes it."""
	words = _WORD.findall(re.sub("['\u2019]", "", _deburr(label or "")))
	return "".join(
		word.lower() if index == 0 else word[:1].upper() + word[1:].lower()
		for index, word in enumerate(words)
	)


def _deburr(text: str) -> str:
	"""Latin letters without their accents; other scripts stay as they are."""
	letters = [
		_DEBURRED.get(letter) or unicodedata.normalize("NFKD", letter)
		if "\u00c0" <= letter <= "\u017f"
		else letter
		for letter in text
	]
	return _COMBINING_MARKS.sub("", "".join(letters))


def set_custom_fieldnames(doc):
	"""Name each new row after its label, as the /books form does."""
	for row in doc.custom_fields:
		row.fieldname = row.fieldname or camel_case(row.label)


def validate_custom_form(doc):
	if not frappe.db.get_single_value("Books Accounting Settings", "enable_form_customization"):
		frappe.throw(_("Enable form customization in Accounting Settings to customize forms."))
	if doc.name in PROTECTED_SCHEMAS or frappe.get_meta(target_doctype(doc.name)).issingle:
		frappe.throw(_("{0} cannot be customized.").format(doc.name))
	_validate_unique_fieldnames(doc.custom_fields)
	for row in doc.custom_fields:
		_validate_custom_field(doc.name, row)


def _validate_unique_fieldnames(rows):
	first_rows = {}
	for row in rows:
		if first := first_rows.get(row.fieldname):
			frappe.throw(
				_("Fieldname {0} already used for Custom Field {1}").format(row.fieldname, first.idx)
			)
		first_rows[row.fieldname] = row


def _validate_custom_field(source_schema: str, row):
	if row.fieldname in schema_mapping()[source_schema]["fields"]:
		frappe.throw(_("Fieldname {0} already exists for {1}").format(row.fieldname, source_schema))
	if (required := REQUIRED_ROW_FIELDS.get(row.fieldtype)) and not row.get(required):
		label = _(frappe.get_meta("Books Custom Field").get_label(required))
		frappe.throw(_("Custom field {0} needs a {1}.").format(row.label, label))
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
