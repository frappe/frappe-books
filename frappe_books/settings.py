import frappe
from frappe import _
from frappe.utils import cstr

# Countries Books ships regional schemas for, by Frappe Country code
REGIONAL_CODES = {"in", "ch"}

# Feature switches the server enforces, by the settings that hold them.
FEATURES = {
	"enable_discounting": "Books Accounting Settings",
	"enable_invoice_returns": "Books Accounting Settings",
	"enable_inventory": "Books Accounting Settings",
	"enable_lead": "Books Accounting Settings",
	"enable_loyalty_program": "Books Accounting Settings",
	"enable_coupon_code": "Books Accounting Settings",
	"enableitem_group": "Books Accounting Settings",
	"enable_batches": "Books Inventory Settings",
	"enable_serial_number": "Books Inventory Settings",
	"enable_uom_conversions": "Books Inventory Settings",
	"enable_point_of_sale": "Books Inventory Settings",
}


# The Books Defaults terms each new document starts with.
DEFAULT_TERMS = {
	"Books Sales Quote": "sales_invoice_terms",
	"Books Sales Invoice": "sales_invoice_terms",
	"Books Purchase Invoice": "purchase_invoice_terms",
	"Books Shipment": "shipment_terms",
	"Books Purchase Receipt": "purchase_receipt_terms",
}


def set_default_terms(doc):
	"""Start a new document with its Books Defaults terms, unless the caller sent terms."""
	if doc.is_new() and doc.get("terms") is None:
		doc.terms = frappe.db.get_single_value("Books Defaults", DEFAULT_TERMS[doc.doctype])


def require_feature(fieldname):
	"""Reject using a feature that is switched off, as the Books app hides it then."""
	settings = FEATURES[fieldname]
	if not frappe.db.get_single_value(settings, fieldname):
		label = _(frappe.get_meta(settings).get_label(fieldname))
		frappe.throw(_("{0} is turned off in {1}.").format(label, _(settings)))


def require_features(doc, features):
	"""Reject a document that sets a field, as `{fieldname: feature}`, whose feature is off."""
	for fieldname, feature in features.items():
		if doc.get(fieldname):
			require_feature(feature)


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
