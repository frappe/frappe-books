import frappe
from frappe.desk.form.load import get_meta_bundle

from frappe_books.accessory import accessory_company
from frappe_books.accessory.form_tabs import get_app_titles, get_custom_field_tabs
from frappe_books.customization import get_placements
from frappe_books.frappe_books.doctype.books_field_pick.books_field_pick import get_field_picks


@frappe.whitelist()
def get_books_meta(doctypes: list[str], layouts: list[str] | None = None) -> dict:
	"""What /books builds its forms from, in one request.

	`metas` holds what Frappe's getdoctype sends for each doctype, its tables' meta included, once
	each. `placements` holds where Books Custom Forms put custom fields. In accessory mode,
	`layouts` names the Books doctypes whose positions lay out the ERPNext `doctypes`; their meta
	comes too, with `accessory` saying where the other ERPNext fields go.
	"""
	bundles = [*doctypes, *(layouts or [])]
	metas = {meta.name: meta for doctype in bundles for meta in get_meta_bundle(doctype)}
	books_meta = {"metas": list(metas.values()), "placements": get_placements()}
	if layouts and accessory_company():
		books_meta["accessory"] = get_accessory_layout(doctypes, list(metas))
	return books_meta


def get_accessory_layout(doctypes: list[str], loaded: list[str]) -> dict:
	"""Where accessory mode forms put ERPNext fields with no Books position."""
	return {
		"tabs": get_custom_field_tabs(loaded),
		"app_titles": get_app_titles(),
		"picks": get_field_picks(doctypes),
	}
