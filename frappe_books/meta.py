import frappe
from frappe.desk.form.load import get_meta_bundle

from frappe_books.customization import get_placements


@frappe.whitelist()
def get_books_meta(doctypes: list[str]) -> dict:
	"""What /books builds its forms from, in one request.

	`metas` holds what Frappe's getdoctype sends for each doctype, its tables' meta included, once
	each. `placements` holds where Books Custom Forms put custom fields.
	"""
	metas = {meta.name: meta for doctype in doctypes for meta in get_meta_bundle(doctype)}
	return {"metas": list(metas.values()), "placements": get_placements()}
