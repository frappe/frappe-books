from frappe_books.reports import financial_statements as statements
from frappe_books.reports.filters import with_defaults


def execute(filters=None):
	filters = with_defaults(filters, get_default_filters())
	return statements.get_trial_balance_columns(), statements.get_trial_balance(filters)


def get_default_filters():
	return statements.get_trial_balance_default_filters()
