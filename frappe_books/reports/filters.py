from frappe.utils import add_days, getdate


def datetime_conditions(fieldname, from_date, to_date):
	"""Return filters for a datetime field between two dates, both days included."""
	conditions = []
	if from_date:
		conditions.append([fieldname, ">=", from_date])
	if to_date:
		conditions.append([fieldname, "<", add_days(getdate(to_date), 1)])
	return conditions
