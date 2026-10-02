"""Books form customizations, stored as Frappe Custom Fields."""

import re
import unicodedata

import frappe
from frappe import _

FIELD_TYPE_MAP = {
	"AttachImage": "Attach Image",
	"Attachment": "Attach",
	"AutoComplete": "Autocomplete",
	"DynamicLink": "Dynamic Link",
}
BOOKS_FIELD_TYPES = {fieldtype: books_fieldtype for books_fieldtype, fieldtype in FIELD_TYPE_MAP.items()}
# The row field that holds a Custom Field's options, by Books field type: a DocType, or the field naming one.
ROW_OPTIONS_FIELDS = {"Link": "target", "Table": "target", "DynamicLink": "references"}
PROTECTED_DOCTYPES = {
	"Books Custom Field",
	"Books Custom Form",
	"Books Ledger Entry",
	"Books Loyalty Point Entry",
	"Books Setup Wizard",
	"Books Stock Ledger Entry",
}
OPTION_FIELDTYPES = {"Select", "AutoComplete"}
CUSTOM_FIELD_PREFIX = "custom_books_"

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
	"""A Books Custom Form is named after the DocType it adds fields to."""
	if not frappe.db.get_single_value("Books Accounting Settings", "enable_form_customization"):
		frappe.throw(_("Enable form customization in Accounting Settings to customize forms."))
	if not _is_customizable(doc.name):
		frappe.throw(_("{0} cannot be customized.").format(doc.name))
	_validate_unique_fieldnames(doc.custom_fields)
	meta = frappe.get_meta(doc.name)
	for row in doc.custom_fields:
		_validate_custom_field(meta, row)


def _is_customizable(doctype: str) -> bool:
	if doctype in PROTECTED_DOCTYPES or not frappe.db.exists("DocType", doctype):
		return False
	return not frappe.get_meta(doctype).issingle


def _validate_unique_fieldnames(rows):
	first_rows = {}
	for row in rows:
		if first := first_rows.get(row.fieldname):
			frappe.throw(
				_("Fieldname {0} already used for Custom Field {1}").format(row.fieldname, first.idx)
			)
		first_rows[row.fieldname] = row


def _validate_custom_field(meta, row):
	if (docfield := meta.get_field(row.fieldname)) and not docfield.get("is_custom_field"):
		frappe.throw(_("Fieldname {0} already exists for {1}").format(row.fieldname, meta.name))
	if (required := ROW_OPTIONS_FIELDS.get(row.fieldtype)) and not row.get(required):
		label = _(frappe.get_meta("Books Custom Field").get_label(required))
		frappe.throw(_("Custom field {0} needs a {1}.").format(row.label, label))
	if row.is_required and not row.default:
		frappe.throw(_("Required custom field {0} needs a default value.").format(row.label))
	options = [option for option in (row.options or "").split("\n") if option.strip()]
	if row.fieldtype in OPTION_FIELDTYPES and len(options) < 2:
		frappe.throw(_("Custom field {0} needs at least two options.").format(row.label))


def get_saved_definition(doctype: str, fieldname: str) -> dict:
	"""Return the row values of a custom field's saved Custom Field, or none before it is saved."""
	docfield = frappe.get_meta(doctype).get_field(custom_target_field(fieldname))
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
	definition[ROW_OPTIONS_FIELDS.get(fieldtype, "options")] = docfield.options
	return definition


def update_custom_fields(doc):
	"""Save each row's definition in its Custom Field and delete those of removed rows."""
	for row in doc.custom_fields:
		_save_custom_field(doc.name, _custom_field_values(row))
	_remove_stale_custom_fields(doc.name, {custom_target_field(row.fieldname) for row in doc.custom_fields})
	frappe.clear_cache(doctype=doc.name)


def remove_custom_fields(doctype: str):
	_remove_stale_custom_fields(doctype, set())
	frappe.clear_cache(doctype=doctype)


def get_placements() -> dict[str, dict[str, dict]]:
	"""Where /books puts each custom field: its tab and section, by DocType and fieldname, in row order.

	`books_fieldname` is the row's own fieldname, which Books' export files key the field by.
	"""
	if not frappe.has_permission("Books Custom Form", "read"):
		return {}
	rows = frappe.get_list(
		"Books Custom Field",
		parent_doctype="Books Custom Form",
		fields=["parent", "fieldname", "section", "tab"],
		order_by="parent, idx",
	)
	placements = {}
	for row in rows:
		placement = {"section": row.section, "tab": row.tab, "books_fieldname": row.fieldname}
		placements.setdefault(row.parent, {})[custom_target_field(row.fieldname)] = placement
	return placements


def custom_target_field(fieldname: str) -> str:
	"""The fieldname of the Custom Field that holds a Books custom field."""
	return f"{CUSTOM_FIELD_PREFIX}{frappe.scrub(fieldname)}"


def _custom_field_values(row) -> dict:
	return {
		"fieldname": custom_target_field(row.fieldname),
		"label": row.label,
		"fieldtype": FIELD_TYPE_MAP.get(row.fieldtype, row.fieldtype),
		"reqd": row.is_required,
		"default": row.default,
		"options": row.get(ROW_OPTIONS_FIELDS.get(row.fieldtype, "options")),
		"is_system_generated": 1,
	}


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
			# The form's save or delete checked permission, so fields Administrator added go too (frappe#43775).
			frappe.delete_doc("Custom Field", field.name, ignore_permissions=True)
