import frappe
from frappe.desk.form.load import get_meta_bundle
from frappe.desk.form.meta import get_code_files_via_hooks, get_js

from frappe_books.accessory import accessory_company
from frappe_books.accessory.form_tabs import get_app_titles, get_custom_field_tabs
from frappe_books.customization import get_placements
from frappe_books.frappe_books.doctype.books_field_pick.books_field_pick import get_field_picks


@frappe.whitelist()
def get_books_meta(doctypes: list[str], layouts: list[str] | None = None) -> dict:
	"""What /books builds its forms from, in one request.

	`metas` holds what Frappe's getdoctype sends for each doctype, its tables' meta included, once
	each. `placements` holds where Books Custom Forms put custom fields, and `scripts` the form
	scripts apps add with the `books_doctype_js` hook, by doctype. In accessory mode,
	`layouts` names the Books doctypes whose positions lay out the ERPNext `doctypes`; their meta
	comes too, with `accessory` saying where the other ERPNext fields go.
	"""
	bundles = [*doctypes, *(layouts or [])]
	metas = {meta.name: meta for doctype in bundles for meta in get_meta_bundle(doctype)}
	books_meta = {
		"metas": list(metas.values()),
		"placements": get_placements(),
		"scripts": get_form_scripts(list(metas)),
	}
	if layouts and accessory_company():
		books_meta["accessory"] = get_accessory_layout(doctypes, list(metas))
	return books_meta


def get_form_scripts(doctypes: list[str]) -> dict[str, str]:
	"""Each doctype's `books_doctype_js` files, in app order, as Frappe reads `doctype_js` for Desk."""
	scripts = {}
	for doctype in doctypes:
		sources = [get_js(path) for path in get_code_files_via_hooks("books_doctype_js", doctype)]
		if source := "\n\n".join(filter(None, sources)):
			scripts[doctype] = source
	return scripts


def get_accessory_layout(doctypes: list[str], loaded: list[str]) -> dict:
	"""Where accessory mode forms put ERPNext fields with no Books position."""
	return {
		"tabs": get_custom_field_tabs(loaded),
		"app_titles": get_app_titles(),
		"picks": get_field_picks(doctypes),
	}
