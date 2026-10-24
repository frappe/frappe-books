"""The print formats and letter heads the print view offers for ERPNext documents, as Desk offers them."""

import frappe

from frappe_books.accessory import accessory_company

STANDARD = "Standard"


@frappe.whitelist()
def get_print_options(doctype: str) -> dict:
	"""The print formats of `doctype`, its default first, and the letter heads with the default one."""
	frappe.has_permission(doctype, "read", throw=True)
	letter_heads = get_letter_heads()
	return {
		"print_formats": get_print_formats(doctype),
		"letter_heads": letter_heads,
		"default_letter_head": get_default_letter_head(letter_heads),
	}


def get_print_formats(doctype: str) -> list[str]:
	"""Desk's list: "Standard" and the enabled formats by name, the DocType's default first.

	Desk reads them from the DocType's meta, so users who cannot read Print Format see them too.
	"""
	names = [STANDARD, *(row.name for row in _enabled_print_formats(doctype) if _is_offered(row))]
	default = frappe.get_meta(doctype).default_print_format
	if default in names:
		names.remove(default)
		names.insert(0, default)
	return names


def _enabled_print_formats(doctype: str) -> list[dict]:
	return frappe.get_all(
		"Print Format",
		filters={"doc_type": doctype, "disabled": 0, "name": ["!=", STANDARD]},
		fields=["name", "print_format_type", "print_format_for", "raw_printing"],
		order_by="name asc",
	)


def _is_offered(print_format: dict) -> bool:
	"""Not a JS or report format, and raw only when Print Settings allow raw printing."""
	return (
		print_format.print_format_type != "JS"
		and print_format.print_format_for != "Report"
		and (not print_format.raw_printing or _raw_printing_enabled())
	)


def _raw_printing_enabled() -> bool:
	return bool(frappe.db.get_single_value("Print Settings", "enable_raw_printing"))


def get_letter_heads() -> list[str]:
	"""The enabled document letter heads the user can read, as Desk's print view offers them."""
	if not frappe.has_permission("Letter Head"):
		return []

	return frappe.get_list(
		"Letter Head",
		filters={"disabled": 0, "letter_head_for": "DocType"},
		pluck="name",
		order_by="name asc",
	)


def get_default_letter_head(letter_heads: list[str]) -> str | None:
	"""The company's default letter head, else the one marked default, if offered."""
	company = accessory_company()
	company_default = company and frappe.db.get_value("Company", company, "default_letter_head")
	marked_default = frappe.db.get_value("Letter Head", {"is_default": 1, "letter_head_for": "DocType"})
	return next((name for name in (company_default, marked_default) if name in letter_heads), None)
