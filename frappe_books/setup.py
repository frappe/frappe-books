"""Install and test bootstrap data for Frappe Books."""

from pathlib import Path

import frappe
from frappe.query_builder.functions import Cast_, Max

from frappe_books.customization import sync_all_custom_forms

DEFAULT_SERIES_START = 1001
NUMERIC_NAME_DOCTYPES = (
	"Books Item Enquiry",
	"Books Ledger Entry",
	"Books Stock Ledger Entry",
)
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
DEFAULT_NUMBER_SERIES = {
	"JV-": "JournalEntry",
	"PAY-": "Payment",
	"PINV-": "PurchaseInvoice",
	"PRLE-": "PricingRule",
	"PREC-": "PurchaseReceipt",
	"SHPM-": "Shipment",
	"SINV-": "SalesInvoice",
	"SMOV-": "StockMovement",
	"SQUOT-": "SalesQuote",
}


def after_install():
	ensure_number_series()
	ensure_default_records()


def before_tests():
	ensure_number_series()
	ensure_numeric_name_series()
	ensure_default_records()


def after_migrate():
	ensure_number_series()
	ensure_numeric_name_series()
	ensure_default_records()
	sync_all_custom_forms()


def ensure_numeric_name_series():
	"""Keep formatted numeric names ahead of legacy autoincrement rows."""
	maximum = max((max_numeric_name(doctype) for doctype in NUMERIC_NAME_DOCTYPES), default=0)
	if not maximum:
		return

	series = frappe.qb.DocType("Series")
	current = frappe.qb.from_(series).select(series.current).where(series.name == "").run()
	if current:
		if int(current[0][0] or 0) < maximum:
			frappe.qb.update(series).set(series.current, maximum).where(series.name == "").run()
		return

	frappe.qb.into(series).columns(series.name, series.current).insert("", maximum).run()


def max_numeric_name(doctype):
	"""Return the largest integer name in a doctype whose names are all numeric."""
	if not frappe.db.table_exists(doctype):
		return 0
	table = frappe.qb.DocType(doctype)
	name_type = "signed" if frappe.db.db_type == "mariadb" else "bigint"
	maximum = frappe.qb.from_(table).select(Max(Cast_(table.name, name_type))).run()[0][0]
	return int(maximum or 0)


def ensure_number_series():
	"""Create the prefixes expected by transaction defaults on a fresh site."""
	for prefix, reference_type in DEFAULT_NUMBER_SERIES.items():
		if frappe.db.exists("Books Number Series", prefix):
			continue
		frappe.get_doc(
			{
				"doctype": "Books Number Series",
				"name": prefix,
				"start": DEFAULT_SERIES_START,
				"pad_zeros": 4,
				"reference_type": reference_type,
				"current": DEFAULT_SERIES_START - 1,
			}
		).insert(ignore_permissions=True)


def ensure_default_records():
	for name, is_whole in (("Unit", 1), ("Kg", 0), ("Gram", 0), ("Meter", 0), ("Hour", 0), ("Day", 0)):
		_insert_if_missing("Books Uom", name, {"is_whole": is_whole})
	_insert_if_missing("Books Location", "Stores", {})
	_insert_if_missing("Books Payment Method", "Cash", {"type": "Cash"})
	for name, template_spec in DEFAULT_PRINT_TEMPLATES.items():
		_sync_default_print_template(name, template_spec)
	_sync_default_print_template_settings()


def _sync_default_print_template_settings():
	settings = frappe.get_single("Books Defaults")
	if all(settings.get(fieldname) == value for fieldname, value in DEFAULT_PRINT_TEMPLATE_FIELDS.items()):
		return

	settings.update(DEFAULT_PRINT_TEMPLATE_FIELDS)
	settings.save(ignore_permissions=True)


def _sync_default_print_template(name, template_spec):
	document_type, filename, width, height = template_spec
	values = {
		"type": document_type,
		"template": (PRINT_TEMPLATE_DIRECTORY / filename).read_text(),
		"width": width,
		"height": height,
		"is_custom": 0,
	}
	if not frappe.db.exists("Books Print Template", name):
		frappe.get_doc({"doctype": "Books Print Template", "name": name, **values}).insert(
			ignore_permissions=True
		)
		return

	template = frappe.get_doc("Books Print Template", name)
	if template.is_custom or all(template.get(fieldname) == value for fieldname, value in values.items()):
		return

	template.update(values)
	template.save(ignore_permissions=True)


def _insert_if_missing(doctype, name, values):
	if frappe.db.exists(doctype, name):
		return
	frappe.get_doc({"doctype": doctype, "name": name, **values}).insert(ignore_permissions=True)
