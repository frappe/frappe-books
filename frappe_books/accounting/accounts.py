import frappe
from frappe import _

PARTY_ACCOUNT_TYPES = {
	"Customer": ("Receivable",),
	"Supplier": ("Payable",),
	"Both": ("Receivable", "Payable"),
}
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


def validate_party_account(doc, fieldname, role):
	"""A customer's ledger account is receivable, a supplier's payable."""
	validate_account(doc, fieldname, PARTY_ACCOUNT_TYPES.get(role, ()))


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


def validate_party_role(doc, is_purchase):
	"""Sales go to customers and purchases come from suppliers; a party with both roles does either."""
	role = doc.party and frappe.db.get_value("Books Party", doc.party, "role")
	expected = "Supplier" if is_purchase else "Customer"
	if role and role not in (expected, "Both"):
		frappe.throw(
			_("{0} must be a {1}, but {2} is a {3}.").format(
				_(doc.meta.get_label("party")), _(expected), doc.party, _(role)
			)
		)


def validate_item_usage(doc, is_purchase):
	"""Sales take items kept for sales and purchases items kept for purchases, as Item Usage says."""
	items = sorted({row.item for row in doc.items if row.item})
	usage, other_usage = ("Purchases", "Sales") if is_purchase else ("Sales", "Purchases")
	other_only = items and frappe.get_all(
		"Books Item", filters={"name": ["in", items], "item_usage": other_usage}, pluck="name"
	)
	if other_only:
		frappe.throw(_("Item {0} is not for {1}.").format(", ".join(sorted(other_only)), _(usage)))
