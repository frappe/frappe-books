import frappe

SHIFT_REMARKS = {
	"Books Pos Opening Shift": "POS opening shift {0}",
	"Books Pos Closing Shift": "POS closing shift {0}",
}


def execute():
	"""Mark shifts that were posted on save as submitted, without posting them again."""
	journals = _shift_journals()
	for doctype, remark in SHIFT_REMARKS.items():
		_submit_drafts(doctype)
		for name in frappe.get_all(doctype, filters={"journal_entry": ["is", "not set"]}, pluck="name"):
			if journal := journals.get(remark.format(name)):
				frappe.db.set_value(doctype, name, "journal_entry", journal, update_modified=False)


def _submit_drafts(doctype):
	shift = frappe.qb.DocType(doctype)
	frappe.qb.update(shift).set(shift.docstatus, 1).where(shift.docstatus == 0).run()
	for field in frappe.get_meta(doctype).get_table_fields():
		row = frappe.qb.DocType(field.options)
		(
			frappe.qb.update(row)
			.set(row.docstatus, 1)
			.where((row.parenttype == doctype) & (row.docstatus == 0))
		).run()


def _shift_journals():
	rows = frappe.get_all(
		"Books Journal Entry",
		filters={"docstatus": 1, "user_remark": ["like", "POS % shift %"]},
		fields=["user_remark", "name"],
		as_list=True,
	)
	return dict(rows)
