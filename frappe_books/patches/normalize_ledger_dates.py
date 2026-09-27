"""Repair ledger dates that early SQLite sites stored as timestamps."""

from collections import defaultdict

import frappe
from frappe.query_builder.functions import Cast_, Length
from frappe.utils import create_batch, getdate

VOUCHER_DATE_FIELDS = {
	"Books Sales Invoice": "date",
	"Books Purchase Invoice": "date",
	"Books Payment": "date",
	"Books Journal Entry": "posting_date",
	"Books Stock Movement": "date",
	"Books Shipment": "date",
	"Books Purchase Receipt": "date",
}


def execute():
	"""Repair legacy timestamp strings using the exact source voucher when available."""
	if frappe.db.db_type != "sqlite" or not frappe.db.table_exists("Books Ledger Entry"):
		return
	ledger = frappe.qb.DocType("Books Ledger Entry")
	stored_date = Cast_(ledger.posting_date, "text")
	entries = (
		frappe.qb.from_(ledger)
		.select(ledger.name, stored_date.as_("posting_date"), ledger.voucher_type, ledger.voucher_no)
		.where(Length(stored_date) > 10)
	).run(as_dict=True)
	by_type = defaultdict(list)
	for entry in entries:
		if len(str(entry.posting_date or "")) > 10:
			by_type[entry.voucher_type].append(entry)
	for voucher_type, rows in by_type.items():
		dates = _voucher_dates(voucher_type, rows)
		for row in rows:
			date = getdate(dates.get(row.voucher_no) or row.posting_date[:10])
			frappe.db.set_value("Books Ledger Entry", row.name, "posting_date", date, update_modified=False)


def _voucher_dates(voucher_type, rows):
	date_field = VOUCHER_DATE_FIELDS.get(voucher_type)
	if not date_field:
		return {}
	dates = {}
	# SQLite allows at most 32766 query parameters.
	for batch in create_batch(list({row.voucher_no for row in rows}), 1000):
		dates.update(
			frappe.get_all(
				voucher_type, filters={"name": ["in", batch]}, fields=["name", date_field], as_list=True
			)
		)
	return dates
