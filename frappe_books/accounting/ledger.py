"""Balanced general-ledger posting and reversal services."""

from collections import defaultdict
from dataclasses import dataclass

import frappe
from frappe import _
from frappe.utils import getdate

from frappe_books.accounting.money import as_decimal, currency_unit, rounded


@dataclass(frozen=True)
class EntryKey:
	account: str
	party: str | None


class LedgerPosting:
	def __init__(self, voucher):
		self.voucher = voucher
		self.debits = defaultdict(as_decimal)
		self.credits = defaultdict(as_decimal)

	def debit(self, account, amount, party=None):
		self._add(self.debits, account, amount, party)

	def credit(self, account, amount, party=None):
		self._add(self.credits, account, amount, party)

	def post(self):
		debits = _rounded_entries(self.debits)
		credits = _rounded_entries(self.credits)
		_add_round_off(debits, credits)
		_validate(debits, credits)
		for entries, fieldname in ((debits, "debit"), (credits, "credit")):
			for key, amount in entries.items():
				self._insert_entry(key, fieldname, amount)

	def _insert_entry(self, key, fieldname, amount):
		values = {
			"doctype": "Books Ledger Entry",
			"posting_date": _posting_date(self.voucher),
			"party": key.party,
			"account": key.account,
			"debit": 0,
			"credit": 0,
			"voucher_type": self.voucher.doctype,
			"voucher_no": self.voucher.name,
		}
		values[fieldname] = amount
		frappe.get_doc(values).insert(ignore_permissions=True)

	def _add(self, entries, account, amount, party):
		amount = as_decimal(amount)
		if not account:
			frappe.throw(_("A ledger account is required."))
		if amount < 0:
			frappe.throw(_("Ledger amounts cannot be negative."))
		entries[EntryKey(account, party)] += amount


def _rounded_entries(entries):
	rounded_entries = defaultdict(as_decimal)
	for key, amount in entries.items():
		if rounded(amount) != 0:
			rounded_entries[key] = rounded(amount)
	return rounded_entries


def _add_round_off(debits, credits):
	"""Absorb the cents lost when each entry is rounded on its own."""
	difference = _total(debits) - _total(credits)
	if difference == 0:
		return
	if abs(difference) > _round_off_limit(len(debits) + len(credits)):
		_throw_unbalanced(_total(debits), _total(credits))
	account = frappe.db.get_single_value("Books Accounting Settings", "round_off_account")
	if not account:
		frappe.throw(_("Set a round-off account in Books Accounting Settings."))
	entries = credits if difference > 0 else debits
	entries[EntryKey(account, None)] += abs(difference)


def _round_off_limit(entry_count):
	"""Rounding moves each entry by at most half the smallest currency unit."""
	return currency_unit() * entry_count / 2


def _validate(debits, credits):
	debit = _total(debits)
	credit = _total(credits)
	if debit != credit:
		_throw_unbalanced(debit, credit)
	if debit == 0:
		frappe.throw(_("Ledger posting total must be greater than zero."))
	validate_leaf_accounts({key.account for key in debits | credits})


def _total(entries):
	return sum(entries.values(), as_decimal(0))


def _throw_unbalanced(debit, credit):
	frappe.throw(_("Total debit {0} must equal total credit {1}.").format(debit, credit))


def reverse_entries(voucher):
	entries = frappe.get_all(
		"Books Ledger Entry",
		filters={
			"voucher_type": voucher.doctype,
			"voucher_no": voucher.name,
			"reverted": 0,
		},
		fields=["name", "account", "party", "debit", "credit"],
		# Reverse newest first, whatever order the list sorts by.
		order_by="creation desc",
	)
	for entry in entries:
		frappe.db.set_value("Books Ledger Entry", entry.name, "reverted", 1, update_modified=False)
		frappe.get_doc(
			{
				"doctype": "Books Ledger Entry",
				"posting_date": _posting_date(voucher),
				"party": entry.party,
				"account": entry.account,
				"debit": entry.credit,
				"credit": entry.debit,
				"voucher_type": voucher.doctype,
				"voucher_no": voucher.name,
				"reverted": 1,
				"reverts": entry.name,
			}
		).insert(ignore_permissions=True)


def delete_entries(voucher):
	frappe.db.delete(
		"Books Ledger Entry",
		{"voucher_type": voucher.doctype, "voucher_no": voucher.name},
	)


def validate_leaf_accounts(accounts):
	rows = frappe.get_all(
		"Books Account",
		filters={"name": ["in", list(accounts)]},
		fields=["name", "is_group"],
	)
	account_map = {row.name: row for row in rows}
	for account in accounts:
		if account not in account_map:
			frappe.throw(_("Account {0} does not exist.").format(account))
		if account_map[account].is_group:
			frappe.throw(_("Group account {0} cannot receive a posting.").format(account))


def _posting_date(voucher):
	return getdate(voucher.get("date") or voucher.get("posting_date"))
