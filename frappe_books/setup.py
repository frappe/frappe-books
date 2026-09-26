"""Install and test bootstrap data for Frappe Books."""

from pathlib import Path

import frappe

from frappe_books.customization import sync_all_custom_forms

DEFAULT_SERIES_START = 1001
DEFAULT_PRINT_TEMPLATES = {
	"Business - Quote": ("SalesQuote", "business_print_template.html", 21, 29.7),
	"Business - Sales Invoice": ("SalesInvoice", "business_print_template.html", 21, 29.7),
	"Business - Purchase Invoice": ("PurchaseInvoice", "business_print_template.html", 21, 29.7),
	"Business - Payment": ("Payment", "business_payment_print_template.html", 21, 29.7),
	"Business - Shipment": ("Shipment", "business_shipment_print_template.html", 21, 29.7),
	"Business-POS - Sales Invoice": ("SalesInvoice", "business_pos_print_template.html", 8, 22),
}
DEFAULT_PRINT_TEMPLATE_FIELDS = {
	"sales_quote_print_template": "Business - Quote",
	"sales_invoice_print_template": "Business - Sales Invoice",
	"purchase_invoice_print_template": "Business - Purchase Invoice",
	"payment_print_template": "Business - Payment",
	"shipment_print_template": "Business - Shipment",
	"pos_print_template": "Business-POS - Sales Invoice",
}
PRINT_TEMPLATE_DIRECTORY = Path(__file__).with_name("data")
# Prefix: (reference type, Books Defaults field that selects it)
DEFAULT_NUMBER_SERIES = {
	"JV-": ("JournalEntry", "journal_entry_number_series"),
	"PAY-": ("Payment", "payment_number_series"),
	"PINV-": ("PurchaseInvoice", "purchase_invoice_number_series"),
	"PRLE-": ("PricingRule", None),
	"PREC-": ("PurchaseReceipt", "purchase_receipt_number_series"),
	"SHPM-": ("Shipment", "shipment_number_series"),
	"SINV-": ("SalesInvoice", "sales_invoice_number_series"),
	"SMOV-": ("StockMovement", "stock_movement_number_series"),
	"SQUOT-": ("SalesQuote", "sales_quote_number_series"),
}
DEFAULT_UOMS = {"Unit": 1, "Kg": 0, "Gram": 0, "Meter": 0, "Hour": 0, "Day": 0}


def bootstrap():
	"""Seed the records every Books site needs. Runs after install and before tests."""
	for prefix, (reference_type, _field) in DEFAULT_NUMBER_SERIES.items():
		values = {"start": DEFAULT_SERIES_START, "pad_zeros": 4, "reference_type": reference_type}
		_insert_if_missing("Books Number Series", prefix, values)
	for name, is_whole in DEFAULT_UOMS.items():
		_insert_if_missing("Books Uom", name, {"is_whole": is_whole})
	_insert_if_missing("Books Location", "Stores", {})
	_insert_if_missing("Books Payment Method", "Cash", {"type": "Cash"})
	for name, template_spec in DEFAULT_PRINT_TEMPLATES.items():
		_insert_if_missing("Books Print Template", name, _print_template_values(template_spec))
	_fill_default_print_templates()


def after_migrate():
	"""Update shipped templates only. Records a user deleted or changed stay that way."""
	update_standard_print_templates()
	sync_all_custom_forms()


def update_standard_print_templates():
	filters = {"name": ["in", list(DEFAULT_PRINT_TEMPLATES)], "is_custom": 0}
	for name in frappe.get_all("Books Print Template", filters=filters, pluck="name"):
		template = frappe.get_doc("Books Print Template", name)
		values = _print_template_values(DEFAULT_PRINT_TEMPLATES[name])
		if any(template.get(fieldname) != value for fieldname, value in values.items()):
			template.update(values)
			template.save(ignore_permissions=True)


def _fill_default_print_templates():
	defaults = frappe.get_single("Books Defaults")
	empty = {field: name for field, name in DEFAULT_PRINT_TEMPLATE_FIELDS.items() if not defaults.get(field)}
	if empty:
		defaults.update(empty)
		defaults.save(ignore_permissions=True)


def _print_template_values(template_spec):
	document_type, filename, width, height = template_spec
	return {
		"type": document_type,
		"template": (PRINT_TEMPLATE_DIRECTORY / filename).read_text(),
		"width": width,
		"height": height,
		"is_custom": 0,
	}


def _insert_if_missing(doctype, name, values):
	if frappe.db.exists(doctype, name):
		return
	frappe.get_doc({"doctype": doctype, "name": name, **values}).insert(ignore_permissions=True)
