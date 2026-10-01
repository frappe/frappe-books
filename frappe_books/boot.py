from frappe.utils.jinja_globals import bundled_asset

from frappe_books.coa import chart_options
from frappe_books.regional import INDIAN_STATES
from frappe_books.settings import regional_code


def extend_bootinfo(bootinfo):
	"""Add what the Books app starts with to the session boot."""
	bootinfo.books = {
		"country_code": regional_code(),
		"charts_of_accounts": chart_options(),
		"indian_states": INDIAN_STATES,
		# The stylesheet Frappe prints with, for print previews in /books
		"print_style": bundled_asset("print.bundle.css"),
	}
