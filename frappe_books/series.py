"""Number series for transactions, batches and serial numbers, counted in Frappe's tabSeries."""

import re

import frappe
from frappe import _
from frappe.model.naming import NamingSeries, make_autoname

INVALID_PREFIX = re.compile(r"[/=?&%]")
INVALID_PREFIX_CHARACTERS = "/, ?, &, =, %"
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
# Named doctype: (item flag, item series field)
ITEM_SERIES = {
	"Books Batch": ("has_batch", "batch_series"),
	"Books Serial Number": ("has_serial_number", "serial_number_series"),
}
ITEM_SERIES_START = 1001
ITEM_SERIES_DIGITS = 4


class SeriesNamingMixin:
	def autoname(self):
		self.set_number_series()
		series = frappe.get_doc("Books Number Series", self.number_series)
		if series.reference_type != NUMBER_SERIES[self.doctype][1]:
			frappe.throw(
				_("Number series {0} is not for {1} documents.").format(series.name, _(self.doctype))
			)
		self.name = make_autoname(series.pattern)

	def set_number_series(self):
		"""Number the document by the default series when none is chosen."""
		self.number_series = self.number_series or default_series(self.doctype)


def default_series(doctype):
	"""The doctype's series from Books Defaults, else its standard prefix."""
	prefix, _, defaults_field = NUMBER_SERIES[doctype]
	return (defaults_field and frappe.db.get_single_value("Books Defaults", defaults_field)) or prefix


def series_pattern(prefix, digits):
	"""The `make_autoname` key that numbers `prefix` with `digits` digits, e.g. SINV-.####."""
	return f"{prefix}.{'#' * max(digits, 1)}"


def start_series(pattern, start):
	"""Count `pattern` from `start`, unless it already counted past it."""
	series = NamingSeries(pattern)
	if series.get_current_value() < start - 1:
		series.update_counter(start - 1)


def validate_prefix(prefix, message):
	"""A prefix shows in /books URLs and must suit a Frappe naming series."""
	if INVALID_PREFIX.search(prefix):
		frappe.throw(message)
	NamingSeries(series_pattern(prefix, 1)).validate()


def new_item_names(doctype, item, count):
	"""Take `count` unused batch or serial-number names from the item's series."""
	frappe.has_permission(doctype, "create", throw=True)
	item_doc = frappe.get_doc("Books Item", item)
	item_doc.check_permission("read")
	flag, series_field = ITEM_SERIES[doctype]
	prefix = (item_doc.get(series_field) or "").strip()
	if not item_doc.get(flag) or not prefix:
		return []
	pattern = series_pattern(prefix, ITEM_SERIES_DIGITS)
	start_series(pattern, ITEM_SERIES_START)
	return unused_names(doctype, pattern, count)


def unused_names(doctype, pattern, count):
	"""Skip numbers already used by hand-named records, as ERPNext names batches."""
	names = []
	while len(names) < count:
		drawn = [make_autoname(pattern) for _ in range(count - len(names))]
		taken = set(frappe.get_all(doctype, filters={"name": ["in", drawn]}, pluck="name"))
		names += [name for name in drawn if name not in taken]
	return names
