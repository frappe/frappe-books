from frappe_books.reports import general_ledger
from frappe_books.reports.filters import get_last_year_dates


def execute(filters=None):
	return general_ledger.get_columns(filters), general_ledger.get_data(filters)


def get_default_filters():
	return get_last_year_dates()
