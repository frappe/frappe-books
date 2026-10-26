"""The link queries of ERPNext forms /books shows, generated from the installed apps' Desk JS.

Desk filters a Link's search with the `set_query` rules of the form's JS. /books does not run
Desk JS, so on migrate `generate.mjs` runs it in Node and keeps the rules that only read the
document's values. They stay in the site's folder until the next migrate or app install.
"""

import json
import os
import shutil
import subprocess

import frappe
from frappe.boot import get_bootinfo
from frappe.desk.form.meta import get_meta as get_form_meta
from frappe.utils import get_assets_json

from frappe_books.accessory import erpnext_installed

GENERATOR = os.path.join(os.path.dirname(__file__), "generate.mjs")
FILE = "books_link_queries.json"
TIMEOUT = 600
# Read-only methods ERPNext's forms call as they load, with their args
LOAD_METHODS = {
	"erpnext.accounts.doctype.accounting_dimension.accounting_dimension.get_dimensions": {
		"with_cost_center_and_project": True
	},
}


def generate_link_queries(*args):
	"""Generates the link queries; a failure is logged, as the site works on without them."""
	try:
		_generate()
	except Exception:
		frappe.log_error("Books could not generate link queries from Desk JS")
		print("Books: could not generate link queries from Desk JS, see the Error Log")


def get_link_queries(doctypes: list[str]) -> dict:
	"""The generated link queries of `doctypes`, by doctype, then `fieldname` or `table.fieldname`."""
	path = frappe.get_site_path(FILE)
	if not os.path.exists(path):
		return {}

	with open(path) as f:
		queries = json.load(f)["queries"]
	return {doctype: queries[doctype] for doctype in doctypes if doctype in queries}


def _generate():
	path = frappe.get_site_path(FILE)
	if not erpnext_installed():
		if os.path.exists(path):
			os.remove(path)
		return

	node = shutil.which("node")
	if not node:
		print("Books: Node.js is not installed, so /books searches links without ERPNext's queries")
		return

	frappe.set_user("Administrator")
	doctypes = get_form_doctypes()
	output = subprocess.run(
		[node, GENERATOR],
		input=frappe.as_json(get_generator_input(doctypes), indent=None),
		capture_output=True,
		text=True,
		timeout=TIMEOUT,
		check=True,
	).stdout
	with open(path, "w") as f:
		f.write(output)

	result = json.loads(output)
	kept = sum(len(queries) for queries in result["queries"].values())
	skipped = sum(len(keys) for keys in result["skipped"].values())
	print(f"Books: {kept} link queries from Desk JS, {skipped} left out as they branch on values")


def get_form_doctypes() -> list[str]:
	"""The ERPNext doctypes accessory mode shows: those Books doctypes stand for, by name."""
	twins = [
		name.removeprefix("Books ")
		for name in frappe.get_all("DocType", {"name": ["like", "Books %"]}, pluck="name")
	]
	return frappe.get_all(
		"DocType", {"name": ["in", twins], "istable": 0, "issingle": 0}, pluck="name", order_by="name"
	)


def get_generator_input(doctypes: list[str]) -> dict:
	"""What `generate.mjs` reads: the apps' Desk bundles, each form's JS, metas and the boot."""
	return {
		"bundles": get_bundles(),
		"forms": {doctype: get_form_meta(doctype).get("__js") or "" for doctype in doctypes},
		"metas": get_metas(doctypes),
		"boot": get_bootinfo(),
		"responses": {method: frappe.call(method, **args) for method, args in LOAD_METHODS.items()},
	}


def get_bundles() -> list[str]:
	"""The built `app_include_js` of every installed app but Frappe's, as Desk loads them."""
	assets = get_assets_json()
	bundles = []
	for app in frappe.get_installed_apps():
		if app == "frappe":
			continue
		for name in frappe.get_hooks("app_include_js", app_name=app):
			url = assets.get(name, name) if ".bundle." in name else name
			path = os.path.join(frappe.local.sites_path, url.lstrip("/"))
			if url.startswith("/assets/") and os.path.exists(path):
				with open(path) as f:
					bundles.append(f.read())
	return bundles


def get_metas(doctypes: list[str]) -> dict:
	"""The metas of the forms and their tables, custom fields included."""
	metas = {}
	for doctype in doctypes:
		meta = frappe.get_meta(doctype)
		metas[doctype] = meta.as_dict()
		for df in meta.get_table_fields():
			metas.setdefault(df.options, frappe.get_meta(df.options).as_dict())
	return metas
