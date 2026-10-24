# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class BooksFieldPick(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_field_pick_field.books_field_pick_field import (
			BooksFieldPickField,
		)

		document_type: DF.Link
		fields: DF.Table[BooksFieldPickField]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Field Pick"

	def validate(self):
		picked = set()
		for row in self.fields:
			key = (row.table_fieldname or "", row.fieldname)
			if key in picked:
				frappe.throw(_("Row #{0}: {1} is picked twice.").format(row.idx, row.fieldname))
			picked.add(key)
			self.validate_field(row)

	def validate_field(self, row):
		meta = frappe.get_meta(self.document_type)
		if row.table_fieldname:
			table = meta.get_field(row.table_fieldname)
			if not table or table.fieldtype not in frappe.model.table_fields:
				frappe.throw(
					_("Row #{0}: {1} has no table {2}.").format(
						row.idx, self.document_type, row.table_fieldname
					)
				)
			meta = frappe.get_meta(table.options)

		if not meta.has_field(row.fieldname):
			frappe.throw(_("Row #{0}: {1} has no field {2}.").format(row.idx, meta.name, row.fieldname))


def get_field_picks(doctypes: list[str]) -> dict[str, dict[str, list[str]]]:
	"""Picked fieldnames by form doctype, then by table fieldname ('' for the document's own)."""
	rows = frappe.get_all(
		"Books Field Pick Field",
		filters={"parenttype": "Books Field Pick", "parent": ("in", doctypes)},
		fields=["parent", "table_fieldname", "fieldname"],
		order_by="idx",
	)
	picks = {}
	for row in rows:
		tables = picks.setdefault(row.parent, {})
		tables.setdefault(row.table_fieldname or "", []).append(row.fieldname)
	return picks
