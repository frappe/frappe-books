import frappe
from frappe.desk.form.load import get_meta_bundle
from frappe.desk.form.meta import get_code_files_via_hooks, get_js

from frappe_books.customization import get_placements


@frappe.whitelist()
def get_books_meta(doctypes: list[str]) -> dict:
	"""What /books builds its forms from, in one request.

	`metas` holds what Frappe's getdoctype sends for each doctype, its tables' meta included, once
	each. `placements` holds where Books Custom Forms put custom fields, and `scripts` the form
	scripts apps add with the `books_doctype_js` hook, by doctype.
	"""
	metas = {meta.name: meta for doctype in doctypes for meta in get_meta_bundle(doctype)}
	return {
		"metas": list(metas.values()),
		"placements": get_placements(),
		"scripts": get_form_scripts(list(metas)),
	}


def get_form_scripts(doctypes: list[str]) -> dict[str, str]:
	"""Each doctype's `books_doctype_js` files, in app order, as Frappe reads `doctype_js` for Desk."""
	scripts = {}
	for doctype in doctypes:
		sources = [get_js(path) for path in get_code_files_via_hooks("books_doctype_js", doctype)]
		if source := "\n\n".join(filter(None, sources)):
			scripts[doctype] = source
	return scripts
