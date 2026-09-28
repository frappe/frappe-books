import frappe
from frappe.core.doctype.report.report import get_report_module_dotted_path
from frappe.desk.query_report import get_report_doc
from frappe.utils import add_days, add_years, getdate


@frappe.whitelist()
def get_default_filters(report_name: str) -> dict:
	"""Return the filter values a Books report opens with."""
	report = get_report_doc(report_name)
	module = get_report_module_dotted_path(report.module, report.name)
	return frappe.get_attr(f"{module}.get_default_filters")()


def with_defaults(filters, defaults) -> frappe._dict:
	"""Return the filters with the defaults filled in where a value is missing."""
	return frappe._dict(defaults, **{key: value for key, value in filters.items() if value not in (None, "")})


def get_last_year_dates() -> dict:
	"""Return the dates of the year up to today."""
	today = getdate()
	return {"from_date": add_years(today, -1), "to_date": today}


def datetime_conditions(fieldname, from_date, to_date):
	"""Return filters for a datetime field between two dates, both days included."""
	conditions = []
	if from_date:
		conditions.append([fieldname, ">=", from_date])
	if to_date:
		conditions.append([fieldname, "<", add_days(getdate(to_date), 1)])
	return conditions
