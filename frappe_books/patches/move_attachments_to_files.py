import json
import mimetypes
from base64 import b64decode

import frappe


def execute():
	"""Move base64 attachments stored in Books fields into private File documents."""
	for doctype in frappe.get_all("DocType", filters={"module": "Frappe Books", "istable": 0}, pluck="name"):
		meta = frappe.get_meta(doctype)
		for field in meta.get("fields", {"fieldtype": ["in", ["Attach", "Attach Image"]]}):
			for name, value in _stored_values(meta, field.fieldname):
				if value and value.startswith(("data:", "{")):
					url = _save_file(doctype, name, field.fieldname, value)
					frappe.db.set_value(doctype, name, field.fieldname, url, update_modified=False)


def _stored_values(meta, fieldname):
	if meta.issingle:
		return [(meta.name, frappe.db.get_single_value(meta.name, fieldname))]
	return frappe.get_all(
		meta.name, filters={fieldname: ["is", "set"]}, fields=["name", fieldname], as_list=True
	)


def _save_file(doctype, name, fieldname, value):
	if value.startswith("{"):
		attachment = json.loads(value)
		filename, content = attachment["name"], _data_url_content(attachment["data"])
	else:
		content = _data_url_content(value)
		filename = fieldname + (mimetypes.guess_extension(value[5 : value.index(";")]) or "")
	file = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": filename,
			"attached_to_doctype": doctype,
			"attached_to_name": name,
			"attached_to_field": fieldname,
			"is_private": 1,
			"content": content,
		}
	)
	# The content is already stored, so the upload size limit must not stop moving it.
	file.flags.skip_file_size_check = True
	file.insert()
	return file.file_url


def _data_url_content(data_url):
	content = b64decode(data_url.split(",", 1)[1])
	# Older interface versions encoded image data URLs twice.
	if content.startswith(b"data:"):
		return _data_url_content(content.decode())
	return content
