"""Dates of Books documents."""

from frappe.utils import get_datetime


def posting_datetime(posting_date, posting_time=None):
	"""A document's posting date and time as one datetime, which orders documents of the same day."""
	return get_datetime(f"{posting_date} {posting_time or '00:00:00'}")
