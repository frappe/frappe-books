import frappe
from frappe import _

PARTY_ACCOUNT_TYPES = {
	"Customer": ("Receivable",),
	"Supplier": ("Payable",),
	"Both": ("Receivable", "Payable"),
}


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


def validate_changed_accounts(doc, rules):
	"""Check the accounts that changed, as `{fieldname: {"account_types": ..., "root_types": ...}}`."""
	for fieldname, types in rules.items():
		if doc.has_value_changed(fieldname):
			validate_account(doc, fieldname, **types)


def validate_party_role(doc, fieldname, roles):
	"""Throw unless the field holds a party with one of the roles, the first one named in the error."""
	party = doc.get(fieldname)
	role = party and frappe.db.get_value("Books Party", party, "role")
	if role and role not in roles:
		frappe.throw(
			_("{0} must be a {1}, but {2} is a {3}.").format(
				_(doc.meta.get_label(fieldname)), _(roles[0]), party, _(role)
			)
		)
