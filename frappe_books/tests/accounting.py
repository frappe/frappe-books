"""Factories used by accounting integration tests."""

import frappe
from frappe.model.base_document import get_controller
from frappe.tests import change_settings
from frappe.utils import flt, now_datetime

from frappe_books.accounting.money import company_currency
from frappe_books.company import company_value, default_company
from frappe_books.inventory.availability import get_stock_quantities
from frappe_books.settings import FEATURES


def enable_features():
	"""Turn every feature switch on for the test site; a switch's own tests turn it off."""
	for fieldname, settings in FEATURES.items():
		frappe.db.set_single_value(settings, fieldname, 1)


def set_default_inventory_accounts():
	"""Give stock movements the ledger accounts the setup wizard sets, as test sites skip it."""
	stock, adjustment = company_value(["default_inventory_account", "stock_adjustment_account"])
	set_company_value(
		{
			"default_inventory_account": stock or make_account("Stock In Hand", account_type="Stock").name,
			"stock_adjustment_account": adjustment
			or make_account("Stock Adjustment", root_type="Expense", account_type="Stock Adjustment").name,
		}
	)


def set_company_value(fieldname, value=None):
	"""Set a value, or a dict of values, of the one Books Company."""
	frappe.db.set_value("Books Company", default_company(), fieldname, value)


def make_account(label, root_type="Asset", **values):
	if not values.get("is_group"):
		values.setdefault("parent_books_account", root_group(root_type))
	return frappe.get_doc(
		{
			"doctype": "Books Account",
			"account_name": unique_name(label),
			"root_type": root_type,
			**values,
		}
	).insert()


def root_group(root_type):
	"""Return the test root group of a root type, as ledger accounts need a parent group."""
	name = f"Test {root_type}"
	if not frappe.db.exists("Books Account", name):
		values = {"account_name": name, "root_type": root_type, "is_group": 1}
		frappe.get_doc({"doctype": "Books Account", **values}).insert()
	return name


PARTY_NAME_FIELDS = {"Books Customer": "customer_name", "Books Supplier": "supplier_name"}


def make_customer(default_account, **values):
	return _make_party("Books Customer", default_account, **values)


def make_supplier(default_account, **values):
	return _make_party("Books Supplier", default_account, **values)


def _make_party(party_type, default_account, **values):
	return frappe.get_doc(
		{
			"doctype": party_type,
			PARTY_NAME_FIELDS[party_type]: unique_name("Test Party"),
			"accounts": [{"account": default_account}] if default_account else [],
			**values,
		}
	).insert()


def make_address(**values):
	"""A Frappe Address, as Books parties, locations and print settings link to."""
	address = {"address_title": unique_name("Address"), "address_type": "Billing", "address_line1": "1 Road"}
	return frappe.get_doc(
		{"doctype": "Address", **address, "city": "City", "country": "India", **values}
	).insert()


def foreign_currency():
	"""Return a currency other than the company's."""
	return "EUR" if company_currency() == "USD" else "USD"


def make_item(income_account, expense_account, tax=None, **values):
	return frappe.get_doc(
		{
			"doctype": "Books Item",
			"name": unique_name("Test Item"),
			"unit": "Unit",
			"income_account": income_account,
			"expense_account": expense_account,
			"tax": tax,
			**values,
		}
	).insert()


def make_tax(account, rate=10):
	return frappe.get_doc(
		{
			"doctype": "Books Item Tax Template",
			"title": unique_name("Test Tax"),
			"taxes": [{"tax_type": account, "tax_rate": rate}],
		}
	).insert()


def make_invoice(doctype, party, account, item, item_account, **values):
	return frappe.get_doc(
		{
			"doctype": doctype,
			get_controller(doctype).party_field: party,
			"account": account,
			"date": now_datetime(),
			"items": [
				{
					"item": item,
					"account": item_account,
					"rate": 100,
					"quantity": 2,
					"item_discount_percent": 10,
				}
			],
			**values,
		}
	).insert()


def ledger_entries(voucher_type, voucher_no):
	return frappe.get_all(
		"Books Ledger Entry",
		filters={"voucher_type": voucher_type, "voucher_no": voucher_no},
		fields=["account", "debit", "credit", "reverted", "reverts"],
		order_by="creation asc",
	)


def restored_company_settings():
	"""Restore the System Settings a Books setup changes, so cached defaults stay right."""
	settings = frappe.get_single("System Settings")
	fields = ("country", "currency", "currency_precision")
	return change_settings("System Settings", {field: settings.get(field) for field in fields})


def ensure_user(email, *roles):
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": email.split("@")[0],
				"send_welcome_email": 0,
				"roles": [{"role": role} for role in roles],
			}
		).insert(ignore_permissions=True)
	return email


def set_inventory_accounts(stock, received, cogs):
	set_company_value(
		{
			"default_inventory_account": stock,
			"stock_received_but_not_billed": received,
			"default_expense_account": cogs,
		}
	)


def stock_quantity(item, location):
	return sum(flt(row.quantity) for row in get_stock_quantities(location, [item]))


def make_number_series(reference_type):
	prefix = f"{reference_type[:4].upper()}-{frappe.generate_hash(length=6)}-"
	return (
		frappe.get_doc(
			{
				"doctype": "Books Number Series",
				"name": prefix,
				"start": 1,
				"pad_zeros": 3,
				"reference_type": reference_type,
			}
		)
		.insert()
		.name
	)


def unique_name(label):
	return f"{label} {frappe.generate_hash(length=8)}"
