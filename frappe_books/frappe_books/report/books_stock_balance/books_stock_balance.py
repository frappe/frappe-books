from frappe_books.reports import stock
from frappe_books.reports.filters import get_last_year_dates


def execute(filters=None):
	return stock.get_balance_columns(filters), stock.get_balance_data(filters)


def get_default_filters():
	return get_last_year_dates()
