from frappe_books.reports import gst


def execute(filters=None):
	return gst.get_columns(filters), gst.get_data("Books Purchase Invoice", filters)


def get_default_filters():
	return gst.get_default_filters()
