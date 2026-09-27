"""Number series for transactions, batches and serial numbers, backed by Frappe records."""

import re

import frappe
from frappe import _

INVALID_PREFIX = re.compile(r"[/=?&%]")
# Named doctype: (item flag, item series field, series doctype)
ITEM_SERIES = {
	"Books Batch": ("has_batch", "batch_series", "Books Batch Series"),
	"Books Serial Number": ("has_serial_number", "serial_number_series", "Books Serial Number Series"),
}


class SeriesNamingMixin:
	def autoname(self):
		prefix = self.get("number_series")
		if prefix:
			self.name = next_name(prefix)


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
