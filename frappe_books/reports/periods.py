import math

import frappe
from frappe import _
from frappe.utils import add_days, add_months, add_years, cint, format_date, get_last_day, getdate, month_diff

MONTHS = {"Monthly": 1, "Quarterly": 3, "Half Yearly": 6, "Yearly": 12}


def get_fiscal_year(date=None) -> tuple:
	"""Return the start and end of the fiscal year that holds `date`, today by default."""
	start, end = _fiscal_year_setting()
	date = getdate(date)
	years = date.year - start.year
	if add_years(start, years) > date:
		years -= 1
	return add_years(start, years), add_years(end, years)


def get_fiscal_years_range(from_year, to_year) -> tuple:
	"""Return the start of the fiscal year starting in `from_year` and the end of the one ending in `to_year`."""
	start, end = _fiscal_year_setting()
	from_date = add_years(start, cint(from_year) - start.year)
	to_date = add_years(end, cint(to_year) - end.year)
	if to_date < from_date:
		frappe.throw(_("To Year cannot be before From Year."))
	return from_date, to_date


def get_periods(filters) -> list[frappe._dict]:
	"""Return the report's periods, newest first, with inclusive dates, a fieldname and a label."""
	months = MONTHS.get(filters.periodicity)
	if not months:
		frappe.throw(_("Choose a valid periodicity."))
	from_date, to_date, count = _date_range(filters, months)
	date_format = frappe.db.get_single_value("Books System Settings", "date_format")
	if filters.consolidate_columns:
		return [_period(from_date, to_date, date_format)]
	ends = [_period_end(to_date, -index * months) for index in range(count + 1)]
	return [
		_period(max(add_days(ends[index + 1], 1), from_date), ends[index], date_format)
		for index in range(count)
	]


def _date_range(filters, months):
	if filters.based_on == "Fiscal Year":
		from_date, to_date = get_fiscal_years_range(filters.from_year, filters.to_year)
		return from_date, to_date, math.ceil(month_diff(to_date, from_date) / months)
	count = cint(filters.count)
	if count < 1:
		frappe.throw(_("Number of periods must be at least 1."))
	to_date = getdate(filters.to_date)
	return add_days(_period_end(to_date, -count * months), 1), to_date, count


def _period_end(to_date, months):
	"""Move the period end by `months`, keeping it on the last day of a month if it was."""
	date = add_months(to_date, months)
	return get_last_day(date) if to_date == get_last_day(to_date) else date


def _period(from_date, to_date, date_format):
	"""A period labelled with its last day, in the date format the Books app shows."""
	return frappe._dict(
		from_date=from_date,
		to_date=to_date,
		key=to_date.strftime("period_%Y_%m_%d"),
		label=format_date(to_date, date_format),
	)


def _fiscal_year_setting():
	start, end = (
		frappe.db.get_single_value("Books Accounting Settings", fieldname)
		for fieldname in ("fiscal_year_start", "fiscal_year_end")
	)
	if not start or not end:
		frappe.throw(_("Set the fiscal year in Accounting Settings."))
	return getdate(start), getdate(end)
