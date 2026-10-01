"""Chart-of-accounts creation for the native Frappe setup flow."""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import frappe
from frappe import _

META_KEYS = {"accountType", "accountNumber", "rootType", "isGroup"}
STANDARD_CHART = "Standard Chart of Accounts"
CHART_DIRECTORY = Path(__file__).with_name("data") / "charts"


@dataclass(frozen=True)
class ChartAccount:
	name: str
	parent: str | None
	root_type: str
	account_type: str | None
	is_group: bool


def chart_options() -> list[dict]:
	"""Return the charts the setup wizard offers, the standard chart first."""
	charts = [{"name": STANDARD_CHART, "countryCode": ""}, *_country_charts()]
	return [
		{
			"name": chart["name"],
			"label": _(chart["name"]),
			"country_code": chart["countryCode"],
			"language": chart.get("language"),
		}
		for chart in charts
	]


def load_chart(chart_name) -> list[ChartAccount]:
	"""Return the named chart's accounts in tree order."""
	if chart_name == STANDARD_CHART:
		return _flatten(json.loads((CHART_DIRECTORY / "standardCOA.json").read_text()))
	for chart in _country_charts():
		if chart["name"] == chart_name:
			return _flatten(chart["tree"])
	frappe.throw(_("Unknown chart of accounts: {0}").format(chart_name))


def ensure_chart(accounts: list[ChartAccount]):
	for account in accounts:
		_create_account(
			account.name, account.parent, account.root_type, account.account_type, account.is_group
		)


def ensure_bank_account(bank_name, accounts, country=None):
	if frappe.db.exists("Books Account", bank_name):
		return bank_name
	return _create_account(
		bank_name,
		parent=bank_account_parent(accounts, country),
		root_type="Asset",
		account_type="Bank",
		is_group=False,
	).name


def bank_account_parent(accounts, country=None):
	"""Return the chart's first bank group, creating the standard one when the chart has none."""
	groups = _type_groups(accounts, "Bank")
	if country == "Indonesia" and "Bank Rupiah - 1121.000" in groups:
		return "Bank Rupiah - 1121.000"
	if groups:
		return groups[0]
	return _ensure_group("Bank Accounts", "Asset", accounts, account_type="Bank")


def ensure_cash_account(accounts):
	"""Return the chart's cash ledger, creating one in its first cash group, else the Asset root."""
	if cash := find_ledger_account(accounts, ["Cash"], "Cash"):
		return cash
	groups = _type_groups(accounts, "Cash")
	parent = groups[0] if groups else _root_account("Asset", accounts)
	return _create_account("Cash", parent, root_type="Asset", account_type="Cash", is_group=False).name


def ensure_discount_account(accounts=()):
	"""Return the Discounts account, creating it under Indirect Income, else the Income root."""
	if frappe.db.exists("Books Account", "Discounts"):
		return "Discounts"
	if frappe.db.exists("Books Account", {"name": "Indirect Income", "is_group": 1}):
		parent = "Indirect Income"
	else:
		parent = _root_account("Income", accounts)
	return _create_account(
		"Discounts",
		parent=parent,
		root_type="Income",
		account_type="Income Account",
		is_group=False,
	).name


def ensure_account(label, parent, root_type, account_type=None, is_group=False):
	"""Create a named account, and its parent group, when missing."""
	if not frappe.db.exists("Books Account", parent):
		_ensure_group(parent, root_type, [])
	return _create_account(label, parent, root_type, account_type, is_group)


def find_ledger_account(accounts, names=(), account_type=None):
	"""Return the chart's ledger of the account type named first in `names`, else its first of the type."""
	ledgers = [
		account.name
		for account in accounts
		if not account.is_group and account_type in (None, account.account_type)
	]
	named = [name for name in names if name in ledgers]
	if named:
		return named[0]
	return ledgers[0] if account_type and ledgers else None


@lru_cache(maxsize=1)
def _country_charts():
	charts = []
	for path in sorted(CHART_DIRECTORY.glob("*.json")):
		chart = json.loads(path.read_text())
		if "tree" in chart:
			charts.append(chart)
	return charts


def _flatten(tree, parent=None, root_type=None, account_type=None):
	"""Children without an account type take their parent's, as Books Account does on save."""
	accounts = []
	for label, node in tree.items():
		if label in META_KEYS or not isinstance(node, dict):
			continue
		name = _account_name(label, node.get("accountNumber"))
		account_root_type = node["rootType"] if parent is None else root_type
		node_type = node.get("accountType") or account_type
		accounts.append(ChartAccount(name, parent, account_root_type, node_type, _is_group(node)))
		accounts.extend(_flatten(node, parent=name, root_type=account_root_type, account_type=node_type))
	return accounts


def _is_group(node):
	has_children = any(key not in META_KEYS and isinstance(value, dict) for key, value in node.items())
	return has_children or bool(node.get("isGroup"))


def _account_name(label, account_number):
	# some charts pad names with spaces, which Frappe strips from document names
	label = label.strip()
	if account_number:
		return f"{label} - {account_number}"
	return label


def _ensure_group(label, root_type, accounts, account_type=None):
	if frappe.db.exists("Books Account", label):
		return label
	return _create_account(
		label,
		parent=_root_account(root_type, accounts),
		root_type=root_type,
		account_type=account_type,
		is_group=True,
	).name


def _type_groups(accounts, account_type):
	return [account.name for account in accounts if account.is_group and account.account_type == account_type]


def _root_account(root_type, accounts):
	"""Return the chart's root of a type, or the site's oldest root when the chart is unknown."""
	for account in accounts:
		if account.parent is None and account.root_type == root_type:
			return account.name
	roots = frappe.get_all(
		"Books Account",
		filters={"root_type": root_type, "parent_books_account": ["is", "not set"]},
		pluck="name",
		order_by="lft asc",
	)
	if not roots:
		frappe.throw(_("The chart of accounts has no {0} root account.").format(root_type))
	return roots[0]


def _create_account(label, parent, root_type, account_type, is_group):
	if frappe.db.exists("Books Account", label):
		return frappe.get_doc("Books Account", label)
	return frappe.get_doc(
		{
			"doctype": "Books Account",
			"account_name": label,
			"parent_books_account": parent,
			"root_type": root_type,
			"account_type": account_type,
			"is_group": is_group,
		}
	).insert(ignore_permissions=True)
