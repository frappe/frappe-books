import frappe
from frappe import _

from frappe_books.company import default_company

PARTY_ACCOUNT_TYPES = {"Books Customer": "Receivable", "Books Supplier": "Payable"}
PAYMENT_ACCOUNT_TYPES = ("Cash", "Bank")


def validate_account(doc, fieldname, account_types=(), root_types=()):
	"""Throw unless the field holds a ledger account of one of the account types and root types."""
	account = doc.get(fieldname)
	values = account and frappe.db.get_value(
		"Books Account", account, ["is_group", "account_type", "root_type"], as_dict=True
	)
	if not values:
		return
	label = _(doc.meta.get_label(fieldname))
	if values.is_group:
		frappe.throw(_("{0} cannot be the group account {1}.").format(label, account))
	for allowed, value in ((account_types, values.account_type), (root_types, values.root_type)):
		if allowed and value not in allowed:
			frappe.throw(
				_("{0} must be of type {1}, but {2} is not.").format(
					label, " or ".join(_(option) for option in allowed), account
				)
			)


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


def latest_ledger_account(account_type):
	"""Return the newest ledger account of the type, the one the Books app offers first."""
	return frappe.db.get_value(
		"Books Account", {"account_type": account_type, "is_group": 0}, "name", order_by="creation desc"
	)
