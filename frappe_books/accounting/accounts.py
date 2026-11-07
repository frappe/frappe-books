import frappe
from frappe import _

from frappe_books.company import company_value, default_company

PARTY_ACCOUNT_TYPES = {"Books Customer": "Receivable", "Books Supplier": "Payable"}
# The Books Company field that holds the default ledger of each party account type
COMPANY_PARTY_ACCOUNTS = {"Receivable": "default_receivable_account", "Payable": "default_payable_account"}
PAYMENT_ACCOUNT_TYPES = ("Cash", "Bank")
# Taxes and charges post to tax, charge, income or expense ledgers; never to money, parties, stock or equity.
TAX_ACCOUNT_TYPES = (
	"",
	"Tax",
	"Chargeable",
	"Income Account",
	"Expense Account",
	"Expenses Included In Valuation",
)
TAX_ROOT_TYPES = ("Asset", "Liability", "Income", "Expense")


def validate_account(doc, fieldname, account_types=(), root_types=()):
	"""Throw unless the field holds a ledger account of one of the account types and root types.

	An empty string in `account_types` allows an account without a type.
	"""
	validate_row_accounts([doc], fieldname, account_types, root_types)


def validate_row_accounts(rows, fieldname, account_types=(), root_types=()):
	"""Check the field of each row as `validate_account` does, with one query for all of them."""
	names = {row.get(fieldname) for row in rows} - {None, ""}
	if not names:
		return
	accounts = frappe.get_all(
		"Books Account",
		filters={"name": ["in", list(names)]},
		fields=["name", "is_group", "account_type", "root_type"],
	)
	accounts = {account.name: account for account in accounts}
	for row in rows:
		if account := accounts.get(row.get(fieldname)):
			_check_account(row, fieldname, account, account_types, root_types)


def _check_account(row, fieldname, account, account_types, root_types):
	label = _(row.meta.get_label(fieldname))
	if row.get("parentfield"):
		label = _("Row #{0}: {1}").format(row.idx, label)
	if account.is_group:
		frappe.throw(_("{0} cannot be the group account {1}.").format(label, account.name))
	for allowed, value in ((account_types, account.account_type or ""), (root_types, account.root_type)):
		if allowed and value not in allowed:
			options = " or ".join(_(option) for option in allowed if option)
			frappe.throw(_("{0} must be of type {1}, but {2} is not.").format(label, options, account.name))


def validate_tax_accounts(rows, fieldname="account_head"):
	validate_row_accounts(rows, fieldname, TAX_ACCOUNT_TYPES, TAX_ROOT_TYPES)


def validate_payment_account(doc, fieldname, method_type):
	"""Cash methods take cash accounts; other methods cash or bank, as the Books payment form offers."""
	validate_account(doc, fieldname, ("Cash",) if method_type == "Cash" else PAYMENT_ACCOUNT_TYPES)


def mode_of_payment_account(mode_of_payment) -> str | None:
	"""The mode's default account for the one company, if it has one."""
	if not mode_of_payment:
		return None
	filters = {"parenttype": "Books Mode of Payment", "parent": mode_of_payment, "company": default_company()}
	return frappe.db.get_value("Books Mode of Payment Account", filters, "default_account")


def validate_party_account(doc, fieldname, party_type):
	"""A customer's ledger account is receivable, a supplier's payable."""
	validate_account(doc, fieldname, (PARTY_ACCOUNT_TYPES[party_type],))


def validate_changed_accounts(doc, rules):
	"""Check the accounts that changed, as `{fieldname: {"account_types": ..., "root_types": ...}}`."""
	for fieldname, types in rules.items():
		if doc.has_value_changed(fieldname):
			validate_account(doc, fieldname, **types)


def company_party_account(account_type):
	"""The company's default receivable or payable ledger."""
	return company_value(COMPANY_PARTY_ACCOUNTS[account_type])


def default_party_account(account_type):
	"""The company's default receivable or payable ledger, else the newest of the type."""
	return company_party_account(account_type) or latest_ledger_account(account_type)


def latest_ledger_account(account_type):
	"""Return the newest ledger account of the type, the one the Books app offers first."""
	return frappe.db.get_value(
		"Books Account", {"account_type": account_type, "is_group": 0}, "name", order_by="creation desc"
	)
