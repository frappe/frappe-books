"""Chart-of-accounts creation for the native Frappe setup flow."""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import frappe
from frappe import _

META_KEYS = {"accountType", "accountNumber", "rootType", "isGroup"}
STANDARD_CHART = "Standard Chart of Accounts"
# The interface bundles these fixtures for its setup wizard, so the repository keeps one copy.
CHART_DIRECTORY = Path(__file__).resolve().parents[1] / "frontend" / "fixtures" / "verified"


@dataclass(frozen=True)
class ChartAccount:
	name: str
	parent: str | None
	root_type: str
	account_type: str | None
	is_group: bool


def chart_names() -> list[str]:
	return [STANDARD_CHART, *(chart["name"] for chart in _country_charts())]


def load_chart(chart_name) -> list[ChartAccount]:
	"""Return the named chart's accounts in tree order. Unknown names load the standard chart."""
	for chart in _country_charts():
		if chart["name"] == chart_name:
			return _flatten(chart["tree"])
	return _flatten(json.loads((CHART_DIRECTORY / "standardCOA.json").read_text()))


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
	groups = [account.name for account in accounts if account.is_group and account.account_type == "Bank"]
	if country == "Indonesia" and "Bank Rupiah - 1121.000" in groups:
		return "Bank Rupiah - 1121.000"
	if groups:
		return groups[0]
	return _ensure_group("Bank Accounts", "Asset", accounts, account_type="Bank")


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


def find_account(accounts, names=(), account_type=None):
	"""Return the first chart account by name, else the first leaf of the chart's first account of the type."""
	by_name = {account.name: account for account in accounts}
	for name in names:
		if name in by_name:
			return name
	typed = next(
		(account for account in accounts if account_type and account.account_type == account_type), None
	)
	if typed is None:
		return None
	return _first_leaf(typed, accounts)


def _first_leaf(account, accounts):
	if not account.is_group:
		return account.name
	child = next((child for child in accounts if child.parent == account.name), None)
	return _first_leaf(child, accounts) if child else account.name


@lru_cache(maxsize=1)
def _country_charts():
	charts = []
	for path in sorted(CHART_DIRECTORY.glob("*.json")):
		chart = json.loads(path.read_text())
		if "tree" in chart:
			charts.append(chart)
	return charts


def _flatten(tree, parent=None, root_type=None):
	accounts = []
	for label, node in tree.items():
		if label in META_KEYS or not isinstance(node, dict):
			continue
		name = _account_name(label, node.get("accountNumber"))
		account_root_type = node["rootType"] if parent is None else root_type
		accounts.append(
			ChartAccount(name, parent, account_root_type, node.get("accountType") or None, _is_group(node))
		)
		accounts.extend(_flatten(node, parent=name, root_type=account_root_type))
	return accounts


def _is_group(node):
	has_children = any(key not in META_KEYS and isinstance(value, dict) for key, value in node.items())
	return has_children or bool(node.get("isGroup"))


def _account_name(label, account_number):
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
