import frappe
from frappe import _
from frappe.utils import cstr

# Countries Books ships regional schemas for, by Frappe Country code
REGIONAL_CODES = {"in", "ch"}


def validate_one_way_switches(doc, fieldnames):
	"""Reject turning off a feature that stays on once enabled."""
	before = doc.get_doc_before_save()
	for fieldname in fieldnames:
		if before and before.get(fieldname) and not doc.get(fieldname):
			frappe.throw(_("{0} cannot be disabled once enabled.").format(_(doc.meta.get_label(fieldname))))


def company_country() -> str | None:
	return frappe.db.get_single_value("System Settings", "country")


def regional_code() -> str:
	"""The regional schema code /books loads for the company country, or "-" for none."""
	country = company_country()
	code = country and frappe.db.get_value("Country", country, "code")
	return code if code in REGIONAL_CODES else "-"


def update_system_settings(values):
	"""Save the changed values only, so users who cannot write System Settings can save the rest."""
	settings = frappe.get_single("System Settings")
	changed = {
		fieldname: value
		for fieldname, value in values.items()
		if cstr(settings.get(fieldname)) != cstr(value)
	}
	if changed:
		settings.check_permission("write")
		settings.update(changed)
		settings.save()
