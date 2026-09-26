"""Factories used by accounting integration tests."""

import frappe
from frappe.utils import now_datetime


def make_account(label, root_type="Asset", account_type=None):
	name = unique_name(label)
	return frappe.get_doc(
		{
			"doctype": "Books Account",
			"account_name": name,
			"root_type": root_type,
			"account_type": account_type,
		}
	).insert()


def make_party(default_account, role="Customer"):
	return frappe.get_doc(
		{
			"doctype": "Books Party",
			"name": unique_name("Test Party"),
			"role": role,
			"default_account": default_account,
		}
	).insert()


def make_item(income_account, expense_account, tax=None, **values):
	return frappe.get_doc(
		{
			"doctype": "Books Item",
			"name": unique_name("Test Item"),
			"item_code": unique_name("ITEM"),
			"item_usage": "Both",
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
			"doctype": "Books Tax",
			"name": unique_name("Test Tax"),
			"details": [{"account": account, "rate": rate}],
		}
	).insert()


def make_invoice(doctype, party, account, item, item_account, **values):
	return frappe.get_doc(
		{
			"doctype": doctype,
			"party": party,
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


def unique_name(label):
	return f"{label} {frappe.generate_hash(length=8)}"
