"""Dates of Books documents."""

import frappe
from frappe import _
from frappe.utils import add_days, add_years, get_datetime, getdate


def posting_datetime(posting_date, posting_time=None):
	"""A document's posting date and time as one datetime, which orders documents of the same day."""
	return get_datetime(f"{posting_date} {posting_time or '00:00:00'}")


def validate_fiscal_year(start, end):
	"""A fiscal year ends after it starts, at most a year later, as ERPNext's Fiscal Year does."""
	if not start or not end:
		return
	start, end = getdate(start), getdate(end)
	if end <= start:
		frappe.throw(_("Fiscal Year End Date must be after Fiscal Year Start Date."))
	if end > add_days(add_years(start, 1), -1):
		frappe.throw(_("A fiscal year cannot be longer than one year."))
