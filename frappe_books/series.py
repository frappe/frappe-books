"""Number series for transactions, batches and serial numbers, backed by Frappe records."""

import re

import frappe
from frappe import _

INVALID_PREFIX = re.compile(r"[/=?&%]")
# Doctype: (standard prefix, series reference type, Books Defaults field that selects its series)
NUMBER_SERIES = {
	"Books Journal Entry": ("JV-", "JournalEntry", "journal_entry_number_series"),
	"Books Payment": ("PAY-", "Payment", "payment_number_series"),
	"Books Purchase Invoice": ("PINV-", "PurchaseInvoice", "purchase_invoice_number_series"),
	"Books Pricing Rule": ("PRLE-", "PricingRule", None),
	"Books Purchase Receipt": ("PREC-", "PurchaseReceipt", "purchase_receipt_number_series"),
	"Books Shipment": ("SHPM-", "Shipment", "shipment_number_series"),
	"Books Sales Invoice": ("SINV-", "SalesInvoice", "sales_invoice_number_series"),
	"Books Stock Movement": ("SMOV-", "StockMovement", "stock_movement_number_series"),
	"Books Sales Quote": ("SQUOT-", "SalesQuote", "sales_quote_number_series"),
}
# Named doctype: (item flag, item series field, series doctype)
ITEM_SERIES = {
	"Books Batch": ("has_batch", "batch_series", "Books Batch Series"),
	"Books Serial Number": ("has_serial_number", "serial_number_series", "Books Serial Number Series"),
}


class SeriesNamingMixin:
	def autoname(self):
		self.number_series = self.number_series or default_series(self.doctype)
		self.name = next_name(self.number_series)


def default_series(doctype):
	return default_series_by_schema()[NUMBER_SERIES[doctype][1]]


def default_series_by_schema():
	"""Return each Books schema's series from Books Defaults, else its standard prefix."""
	defaults = frappe.db.get_singles_dict("Books Defaults")
	return {
		reference_type: (defaults_field and defaults.get(defaults_field)) or prefix
		for prefix, reference_type, defaults_field in NUMBER_SERIES.values()
	}


def next_name(prefix):
	return reserve_names("Books Number Series", prefix)[0]


def reserve_names(series_doctype, prefix, count=1):
	"""Take the next `count` numbers of a series.

	The increment happens in the database and locks the series row until commit, so concurrent
	callers never get the same number.
	"""
	pad_zeros = frappe.get_doc(series_doctype, prefix).pad_zeros
	series = frappe.qb.DocType(series_doctype)
	frappe.qb.update(series).set(series.current, series.current + count).where(series.name == prefix).run()
	last = int(frappe.db.get_value(series_doctype, prefix, "current"))
	return [f"{prefix}{number:0{pad_zeros}d}" for number in range(last - count + 1, last + 1)]


def new_item_names(doctype, item, count):
	"""Reserve `count` unused batch or serial-number names from the item's series."""
	frappe.has_permission(doctype, "create", throw=True)
	item_doc = frappe.get_doc("Books Item", item)
	item_doc.check_permission("read")
	flag, series_field, series_doctype = ITEM_SERIES[doctype]
	prefix = (item_doc.get(series_field) or "").strip()
	if not item_doc.get(flag) or not prefix:
		return []
	return _reserve_unused_names(doctype, series_doctype, prefix, count)


def _reserve_unused_names(doctype, series_doctype, prefix, count):
	"""Skip numbers already used by hand-named records."""
	names = []
	while len(names) < count:
		reserved = reserve_names(series_doctype, prefix, count - len(names))
		taken = set(frappe.get_all(doctype, filters={"name": ["in", reserved]}, pluck="name"))
		names += [name for name in reserved if name not in taken]
	return names


def validate_series(series_doc):
	if INVALID_PREFIX.search(series_doc.name or ""):
		frappe.throw(_("Number-series prefixes cannot contain /, ?, &, =, or %."))
	if series_doc.start < 0:
		frappe.throw(_("Number-series start must be zero or greater."))
	if series_doc.pad_zeros < 0:
		frappe.throw(_("Number-series padding must be zero or greater."))
	if series_doc.is_new() and not series_doc.current:
		series_doc.current = series_doc.start - 1
