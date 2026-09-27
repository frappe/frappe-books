import frappe
from frappe import _


def validate_one_way_switches(doc, fieldnames):
	"""Reject turning off a feature that stays on once enabled."""
	before = doc.get_doc_before_save()
	for fieldname in fieldnames:
		if before and before.get(fieldname) and not doc.get(fieldname):
			frappe.throw(_("{0} cannot be disabled once enabled.").format(_(doc.meta.get_label(fieldname))))
