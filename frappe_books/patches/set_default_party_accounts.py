import frappe

from frappe_books.accounting.accounts import DEFAULT_PARTY_ACCOUNT_FIELDS
from frappe_books.coa import chart_default_names

STANDARD_NAMES = {"Receivable": ("receivable", "Debtors"), "Payable": ("payable", "Creditors")}


def execute():
	"""Default parties to the set-up chart's trade receivable and payable, as setup now does."""
	chart = frappe.db.get_single_value("Books Setup Wizard", "chart_of_accounts")
	names = chart_default_names(chart) if chart else {}
	for account_type, (key, standard_name) in STANDARD_NAMES.items():
		fieldname = DEFAULT_PARTY_ACCOUNT_FIELDS[account_type]
		if frappe.db.get_single_value("Books Accounting Settings", fieldname):
			continue
		for name in (names.get(key), standard_name):
			if name and frappe.db.exists(
				"Books Account", {"name": name, "account_type": account_type, "is_group": 0}
			):
				frappe.db.set_single_value("Books Accounting Settings", fieldname, name)
				break
